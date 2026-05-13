import { db } from "@/db";
import {
  channels,
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
import { and, eq, sql } from "drizzle-orm";
import { AmazonAPIClient, AmazonRateLimitError } from "./api/client";

const SOURCE = "amazon_finances_2024";
const SOURCE_API_VERSION = "finances/2024-06-19";
const FINANCE_SYNC_DELAY_MS = 48 * 60 * 60 * 1000;
const DEFAULT_FINANCE_SYNC_LIMIT = 3;
const MANUAL_FINANCE_SYNC_LIMIT = 5;
const FINANCE_REQUEST_DELAY_MS = 2500;
const FINANCE_RETRY_COOLDOWN_MS = 60 * 60 * 1000;
const NO_DATA_RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const FAILURE_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_FINANCE_ATTEMPTS = 6;

type AmazonTransaction = Record<string, unknown> & {
  transactionId?: string;
  transactionType?: string;
  transactionStatus?: string;
  description?: string;
  postedDate?: string;
  totalAmount?: AmazonCurrency;
  items?: AmazonItem[];
  breakdowns?: AmazonBreakdown[];
  relatedIdentifiers?: Array<Record<string, unknown>>;
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

  for (const [index, order] of candidates.entries()) {
    if (index > 0) {
      await sleep(FINANCE_REQUEST_DELAY_MS);
    }

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
          nextAttemptAt: new Date(Date.now() + NO_DATA_RETRY_COOLDOWN_MS),
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
      if (error instanceof AmazonRateLimitError) {
        await markOrderFinanceStatus({
          orderId: order.id,
          channelId,
          source: SOURCE,
          status: "pending",
          nextAttemptAt: new Date(Date.now() + FINANCE_RETRY_COOLDOWN_MS),
          error: {
            code: "amazon_finance_rate_limited",
            message: "Amazon finance sync was rate limited and will retry later.",
          },
        });
        logger.warn("[Amazon Finance] Rate limited; deferring remaining finance batch", {
          channelId,
          checked: result.checked,
          remaining: candidates.length - result.checked,
        });
        result.failed++;
        break;
      }

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
          nextAttemptAt: new Date(Date.now() + FAILURE_RETRY_COOLDOWN_MS),
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
  const canonicalTransactions = selectCanonicalTransactions(
    transactions
    .filter(isRecord)
      .map((transaction) => transaction as AmazonTransaction),
  );

  return canonicalTransactions
    .map((transaction, index) => {
      const transactionId =
        typeof transaction.transactionId === "string"
          ? transaction.transactionId
          : null;

      const components = normalizeTransactionComponents(transaction);

      return {
        dedupeKey: transactionId ?? `${externalOrderId}:${index}`,
        externalEventId: transactionId,
        eventType: String(
          transaction.transactionType ||
            transaction.description ||
            "transaction",
        ),
        eventStatus:
          typeof transaction.transactionStatus === "string"
            ? transaction.transactionStatus
            : null,
        postedAt:
          typeof transaction.postedDate === "string"
            ? new Date(transaction.postedDate)
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
  const defaultLimit = options.orderId ? 1 : DEFAULT_FINANCE_SYNC_LIMIT;
  const maxLimit = options.orderId ? 1 : MANUAL_FINANCE_SYNC_LIMIT;
  const limit = Math.max(1, Math.min(options.limit ?? defaultLimit, maxLimit));
  const eligibleBefore = new Date(Date.now() - FINANCE_SYNC_DELAY_MS);
  const statusScope = options.orderId
    ? sql`and sofs.status in ('pending', 'synced', 'no_data', 'failed')`
    : sql`and sofs.status in ('pending', 'no_data', 'failed')`;
  const attemptScope = options.orderId
    ? sql``
    : sql`and sofs.attempt_count < ${MAX_FINANCE_ATTEMPTS}`;
  const orderScope = options.orderId
    ? sql`and so.id = ${options.orderId}`
    : sql`and so.purchased_at <= ${eligibleBefore.toISOString()}`;
  const retryScope = options.orderId
    ? sql``
    : sql`and (
        sofs.next_attempt_at is null
        or sofs.next_attempt_at <= now()
      )`;

  await db.execute(sql`
    insert into sales_order_finance_syncs (
      order_id,
      channel_id,
      status,
      source,
      next_attempt_at,
      created_at,
      updated_at
    )
    select
      so.id,
      so.channel_id,
      'pending'::finance_sync_status,
      ${SOURCE},
      now(),
      now(),
      now()
    from sales_orders so
    join channels c on c.id = so.channel_id
    where c.user_id = ${userId}
      and so.channel_id = ${channelId}
      and so.status in ('shipped', 'delivered', 'returned', 'refunded')
      ${orderScope}
    on conflict ("order_id") do nothing
  `);

  const rows = await db.execute(sql`
    with candidates as (
      select sofs.id
      from sales_order_finance_syncs sofs
      join sales_orders so on so.id = sofs.order_id
      join channels c on c.id = so.channel_id
      where c.user_id = ${userId}
        and so.channel_id = ${channelId}
        and so.status in ('shipped', 'delivered', 'returned', 'refunded')
        ${statusScope}
        ${attemptScope}
        ${orderScope}
        ${retryScope}
      order by coalesce(so.purchased_at, so.created_at) asc
      limit ${limit}
      for update skip locked
    ),
    claimed as (
      update sales_order_finance_syncs sofs
      set
        status = 'pending'::finance_sync_status,
        source = ${SOURCE},
        last_attempt_at = now(),
        next_attempt_at = now() + (${FINANCE_RETRY_COOLDOWN_MS} * interval '1 millisecond'),
        attempt_count = sofs.attempt_count + 1,
        updated_at = now()
      from candidates
      where sofs.id = candidates.id
      returning sofs.order_id, sofs.channel_id
    )
    select
      so.id,
      so.channel_id as "channelId",
      so.external_order_id as "externalOrderId"
    from claimed
    join sales_orders so on so.id = claimed.order_id
    order by coalesce(so.purchased_at, so.created_at) asc
  `);

  return rows as unknown as CandidateOrder[];
}

function normalizeTransactionComponents(
  transaction: AmazonTransaction,
): FinanceComponentInput[] {
  const components: FinanceComponentInput[] = [];
  const transactionCurrency = transaction.totalAmount?.currencyCode ?? null;
  const itemsWithBreakdowns = (transaction.items ?? []).filter(
    (item) => (item.breakdowns ?? []).length > 0,
  );

  if (itemsWithBreakdowns.length > 0) {
    for (const breakdown of transaction.breakdowns ?? []) {
      if (isTransactionRollupContainer(breakdown)) continue;

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

    for (const item of itemsWithBreakdowns) {
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

  return components;
}

function selectCanonicalTransactions(
  transactions: AmazonTransaction[],
): AmazonTransaction[] {
  const byLifecycleKey = new Map<string, AmazonTransaction>();

  for (const transaction of transactions) {
    const key = getTransactionLifecycleKey(transaction);
    const existing = byLifecycleKey.get(key);

    if (!existing || compareTransactionPriority(transaction, existing) > 0) {
      byLifecycleKey.set(key, transaction);
    }
  }

  return Array.from(byLifecycleKey.values()).sort((left, right) => {
    const leftTime = getPostedTime(left);
    const rightTime = getPostedTime(right);
    return leftTime - rightTime;
  });
}

function getTransactionLifecycleKey(transaction: AmazonTransaction): string {
  const amount = toAmountString(transaction.totalAmount?.currencyAmount) ?? "";
  const currency = transaction.totalAmount?.currencyCode ?? "";
  const shipmentId = getRelatedIdentifier(transaction, "SHIPMENT_ID");
  const itemIds = (transaction.items ?? [])
    .flatMap((item) => item.relatedIdentifiers ?? [])
    .map((identifier) => {
      const value = identifier.itemRelatedIdentifierValue;
      return typeof value === "string" ? value : "";
    })
    .filter(Boolean)
    .sort()
    .join(",");

  return [
    transaction.transactionType ?? "",
    transaction.description ?? "",
    currency,
    amount,
    shipmentId ?? "",
    itemIds,
  ].join("|");
}

function compareTransactionPriority(
  candidate: AmazonTransaction,
  existing: AmazonTransaction,
): number {
  const statusDifference =
    getTransactionStatusPriority(candidate.transactionStatus) -
    getTransactionStatusPriority(existing.transactionStatus);
  if (statusDifference !== 0) return statusDifference;

  return getPostedTime(candidate) - getPostedTime(existing);
}

function getTransactionStatusPriority(status: string | undefined): number {
  const normalizedStatus = (status ?? "").toLowerCase();
  if (normalizedStatus === "released") return 3;
  if (normalizedStatus === "deferred_released") return 2;
  if (normalizedStatus === "deferred") return 1;
  return 0;
}

function getPostedTime(transaction: AmazonTransaction): number {
  if (typeof transaction.postedDate !== "string") return 0;
  const postedAt = new Date(transaction.postedDate).getTime();
  return Number.isNaN(postedAt) ? 0 : postedAt;
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
  const amount = toAmountString(breakdown.breakdownAmount?.currencyAmount);
  if (!amount || !shouldCaptureBreakdown(breakdown)) {
    return (breakdown.breakdowns ?? []).flatMap((child) =>
      flattenBreakdowns(child, context),
    );
  }

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
  ];
}

function shouldCaptureBreakdown(breakdown: AmazonBreakdown): boolean {
  const normalizedCode = (breakdown.breakdownType ?? "").toLowerCase();
  const hasChildren = (breakdown.breakdowns ?? []).length > 0;

  if (normalizedCode === "sales" || normalizedCode === "expenses") {
    return false;
  }

  if (normalizedCode === "refunded expenses" || normalizedCode === "refunded sales") {
    return false;
  }

  if (normalizedCode === "amazonfees" && hasChildren) {
    return false;
  }

  return true;
}

function isTransactionRollupContainer(breakdown: AmazonBreakdown): boolean {
  const normalizedCode = (breakdown.breakdownType ?? "").toLowerCase();
  return (
    normalizedCode === "sales" ||
    normalizedCode === "expenses" ||
    normalizedCode === "refunded sales" ||
    normalizedCode === "refunded expenses"
  );
}

function classifyAmazonAmountRole(
  code: string | undefined,
  transactionType: string | undefined,
): FinanceAmountRole {
  const normalizedCode = (code ?? "").toLowerCase();
  const normalizedTransactionType = (transactionType ?? "").toLowerCase();

  if (
    normalizedCode.includes("tds") ||
    normalizedCode.includes("withholding") ||
    normalizedCode.includes("withheld") ||
    normalizedCode.includes("taxcollectedatsource")
  ) {
    return "withholding";
  }
  if (
    normalizedCode.includes("commission") ||
    normalizedCode.includes("fee") ||
    normalizedCode.includes("chargeback") ||
    normalizedCode.includes("closing") ||
    normalizedCode.includes("amazonfees")
  ) {
    return "marketplace_fee";
  }
  if (normalizedTransactionType.includes("refund")) return "refund";
  if (
    normalizedCode.includes("principal") ||
    normalizedCode.includes("productcharges")
  ) {
    return "principal";
  }
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

function getRelatedIdentifier(
  transaction: AmazonTransaction,
  targetName: string,
): string | null {
  const identifiers = transaction.relatedIdentifiers;
  if (!Array.isArray(identifiers)) return null;

  for (const identifier of identifiers) {
    if (!isRecord(identifier)) continue;
    const name = identifier.relatedIdentifierName;
    const value = identifier.relatedIdentifierValue;
    if (name === targetName && typeof value === "string" && value) {
      return value;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
