import { db } from "@/db";
import {
  channels,
  salesOrders,
  type FinanceAmountRole,
} from "@/db/schema";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import type { OrderFinanceSyncResult } from "@/lib/channels/types";
import {
  markOrderFinanceStatus,
  persistOrderFinance,
} from "@/lib/order-finance/service";
import type {
  FinanceComponentInput,
  FinanceEventInput,
} from "@/lib/order-finance/types";
import { logger } from "@/lib/logger";
import { and, eq, inArray, sql } from "drizzle-orm";
import { AmazonAPIClient } from "./api/client";

const SOURCE = "amazon_finances_2024";
const SOURCE_API_VERSION = "finances/2024-06-19";
const FINANCE_SYNC_DELAY_MS = 48 * 60 * 60 * 1000;
const DEFAULT_FINANCE_SYNC_LIMIT = 20;

type AmazonTransaction = Record<string, unknown> & {
  transactionId?: string;
  transactionType?: string;
  transactionStatus?: string;
  description?: string;
  postedDate?: string;
  totalAmount?: AmazonCurrency;
  items?: AmazonItem[];
  breakdowns?: AmazonBreakdown[];
};

type AmazonCurrency = {
  currencyCode?: string;
  currencyAmount?: number | string;
};

type AmazonBreakdown = {
  breakdownType?: string;
  breakdownAmount?: AmazonCurrency;
  breakdowns?: AmazonBreakdown[];
};

type AmazonItem = Record<string, unknown> & {
  description?: string;
  totalAmount?: AmazonCurrency;
  relatedIdentifiers?: Array<Record<string, unknown>>;
  breakdowns?: AmazonBreakdown[];
  contexts?: Array<Record<string, unknown>>;
};

type CandidateOrder = {
  id: number;
  channelId: number;
  externalOrderId: string;
};

export async function syncAmazonOrderFinances(
  userId: number,
  channelId: number,
  options: {
    orderId?: number;
    limit?: number;
    retryFailed?: boolean;
  } = {},
): Promise<OrderFinanceSyncResult> {
  const result: OrderFinanceSyncResult = {
    checked: 0,
    synced: 0,
    noData: 0,
    failed: 0,
    notSupported: 0,
  };

  const [channel] = await db
    .select({
      id: channels.id,
      userId: channels.userId,
      channelType: channels.channelType,
      storeUrl: channels.storeUrl,
      credentials: channels.credentials,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (!channel) throw new Error("Channel not found.");
  if (channel.channelType !== "amazon") {
    throw new Error("Channel is not an Amazon channel");
  }

  const credentials = await decryptChannelCredentials(channel.credentials);
  const client = new AmazonAPIClient(credentials, channel.storeUrl || "");
  const candidates = await getCandidateOrders(userId, channelId, options);

  for (const order of candidates) {
    result.checked++;
    try {
      const transactions = await client.getFinanceTransactionsByOrderId(
        order.externalOrderId,
      );

      if (transactions.length === 0) {
        await markOrderFinanceStatus({
          orderId: order.id,
          channelId,
          source: SOURCE,
          status: "no_data",
        });
        result.noData++;
        continue;
      }

      await persistOrderFinance({
        orderId: order.id,
        channelId,
        source: SOURCE,
        status: "synced",
        events: normalizeAmazonFinanceTransactions(
          transactions,
          order.externalOrderId,
        ),
      });
      result.synced++;
    } catch (error) {
      logger.error("[Amazon Finance] Failed to sync order finance", {
        channelId,
        orderId: order.id,
        externalOrderId: order.externalOrderId,
        error: String(error),
      });

      await markOrderFinanceStatus({
        orderId: order.id,
        channelId,
        source: SOURCE,
        status: "failed",
        error: {
          code: "amazon_finance_sync_failed",
          message: "Amazon finance sync failed. Check server logs for details.",
        },
      });
      result.failed++;
    }
  }

  return result;
}

export function normalizeAmazonFinanceTransactions(
  transactions: unknown[],
  externalOrderId: string,
): FinanceEventInput[] {
  return transactions
    .filter(isRecord)
    .map((transaction, index) => {
      const typedTransaction = transaction as AmazonTransaction;
      const transactionId =
        typeof typedTransaction.transactionId === "string"
          ? typedTransaction.transactionId
          : null;

      const components = normalizeTransactionComponents(typedTransaction);

      return {
        dedupeKey: transactionId ?? `${externalOrderId}:${index}`,
        externalEventId: transactionId,
        eventType: String(
          typedTransaction.transactionType ||
            typedTransaction.description ||
            "transaction",
        ),
        eventStatus:
          typeof typedTransaction.transactionStatus === "string"
            ? typedTransaction.transactionStatus
            : null,
        postedAt:
          typeof typedTransaction.postedDate === "string"
            ? new Date(typedTransaction.postedDate)
            : null,
        sourceApiVersion: SOURCE_API_VERSION,
        rawData: transaction,
        components,
      };
    });
}

async function getCandidateOrders(
  userId: number,
  channelId: number,
  options: {
    orderId?: number;
    limit?: number;
    retryFailed?: boolean;
  },
): Promise<CandidateOrder[]> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_FINANCE_SYNC_LIMIT, 100));
  const eligibleBefore = new Date(Date.now() - FINANCE_SYNC_DELAY_MS);
  const retryStatusSql = options.retryFailed
    ? sql`('pending', 'no_data', 'failed')`
    : sql`('pending', 'no_data')`;

  return db
    .select({
      id: salesOrders.id,
      channelId: salesOrders.channelId,
      externalOrderId: salesOrders.externalOrderId,
    })
    .from(salesOrders)
    .innerJoin(
      channels,
      and(eq(channels.id, salesOrders.channelId), eq(channels.userId, userId)),
    )
    .where(
      and(
        eq(salesOrders.channelId, channelId),
        options.orderId ? eq(salesOrders.id, options.orderId) : undefined,
        inArray(salesOrders.status, ["shipped", "delivered", "returned", "refunded"]),
        options.orderId
          ? undefined
          : sql`${salesOrders.purchasedAt} <= ${eligibleBefore.toISOString()}`,
        options.orderId
          ? undefined
          : sql`not exists (
            select 1
            from sales_order_finance_syncs sofs
            where sofs.order_id = ${salesOrders.id}
              and sofs.status = 'synced'
          )`,
        options.orderId
          ? undefined
          : sql`(
            not exists (
              select 1
              from sales_order_finance_syncs sofs
              where sofs.order_id = ${salesOrders.id}
            )
            or exists (
              select 1
              from sales_order_finance_syncs sofs
              where sofs.order_id = ${salesOrders.id}
                and sofs.status in ${retryStatusSql}
            )
          )`,
      ),
    )
    .orderBy(sql`coalesce(${salesOrders.purchasedAt}, ${salesOrders.createdAt}) asc`)
    .limit(limit);
}

function normalizeTransactionComponents(
  transaction: AmazonTransaction,
): FinanceComponentInput[] {
  const components: FinanceComponentInput[] = [];
  const transactionCurrency = transaction.totalAmount?.currencyCode ?? null;

  for (const breakdown of transaction.breakdowns ?? []) {
    components.push(
      ...flattenBreakdowns(breakdown, {
        externalItemId: null,
        sku: null,
        quantity: null,
        transactionType: transaction.transactionType,
        fallbackCurrency: transactionCurrency,
      }),
    );
  }

  for (const item of transaction.items ?? []) {
    const sku = getItemSku(item);
    const externalItemId = getItemExternalId(item);
    const quantity = getItemQuantity(item);
    const fallbackCurrency =
      item.totalAmount?.currencyCode ?? transactionCurrency ?? null;

    for (const breakdown of item.breakdowns ?? []) {
      components.push(
        ...flattenBreakdowns(breakdown, {
          externalItemId,
          sku,
          quantity,
          transactionType: transaction.transactionType,
          fallbackCurrency,
        }),
      );
    }
  }

  return components;
}

function flattenBreakdowns(
  breakdown: AmazonBreakdown,
  context: {
    externalItemId: string | null;
    sku: string | null;
    quantity: number | null;
    transactionType?: string;
    fallbackCurrency: string | null;
  },
): FinanceComponentInput[] {
  const nested = (breakdown.breakdowns ?? []).flatMap((child) =>
    flattenBreakdowns(child, context),
  );

  const amount = toAmountString(breakdown.breakdownAmount?.currencyAmount);
  if (!amount) return nested;

  return [
    {
      externalItemId: context.externalItemId,
      sku: context.sku,
      quantity: context.quantity,
      amountRole: classifyAmazonAmountRole(
        breakdown.breakdownType,
        context.transactionType,
      ),
      code: breakdown.breakdownType || "unknown",
      amount,
      currency:
        breakdown.breakdownAmount?.currencyCode ?? context.fallbackCurrency,
      rawData: breakdown as Record<string, unknown>,
    },
    ...nested,
  ];
}

function classifyAmazonAmountRole(
  code: string | undefined,
  transactionType: string | undefined,
): FinanceAmountRole {
  const normalizedCode = (code ?? "").toLowerCase();
  const normalizedTransactionType = (transactionType ?? "").toLowerCase();

  if (normalizedTransactionType.includes("refund")) return "refund";
  if (normalizedCode.includes("principal")) return "principal";
  if (normalizedCode.includes("tax") && !normalizedCode.includes("tds")) return "tax";
  if (normalizedCode.includes("shipping") && !normalizedCode.includes("chargeback")) {
    return "shipping_revenue";
  }
  if (
    normalizedCode.includes("promotion") ||
    normalizedCode.includes("discount")
  ) {
    return "discount";
  }
  if (
    normalizedCode.includes("tds") ||
    normalizedCode.includes("withholding") ||
    normalizedCode.includes("withheld")
  ) {
    return "withholding";
  }
  if (
    normalizedCode.includes("commission") ||
    normalizedCode.includes("fee") ||
    normalizedCode.includes("chargeback") ||
    normalizedCode.includes("closing")
  ) {
    return "marketplace_fee";
  }
  if (normalizedCode.includes("adjustment")) return "adjustment";
  return "other";
}

function getItemSku(item: AmazonItem): string | null {
  for (const context of item.contexts ?? []) {
    if (typeof context.sku === "string" && context.sku) return context.sku;
  }
  return null;
}

function getItemQuantity(item: AmazonItem): number | null {
  for (const context of item.contexts ?? []) {
    if (typeof context.quantityShipped === "number") return context.quantityShipped;
  }
  return null;
}

function getItemExternalId(item: AmazonItem): string | null {
  for (const identifier of item.relatedIdentifiers ?? []) {
    const name =
      typeof identifier.itemRelatedIdentifierName === "string"
        ? identifier.itemRelatedIdentifierName
        : "";
    const value =
      typeof identifier.itemRelatedIdentifierValue === "string"
        ? identifier.itemRelatedIdentifierValue
        : "";
    if (name === "ORDER_ITEM_ID" || name === "ORDER_ADJUSTMENT_ITEM_ID") {
      return value || null;
    }
  }
  return null;
}

function toAmountString(value: number | string | undefined): string | null {
  if (value === undefined || value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed.toFixed(2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
