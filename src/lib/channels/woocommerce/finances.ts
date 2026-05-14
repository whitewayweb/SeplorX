import { db } from "@/db";
import { channels, salesOrders } from "@/db/schema";
import type { OrderFinanceSyncResult } from "@/lib/channels/types";
import {
  markOrderFinanceStatus,
  persistOrderFinance,
} from "@/lib/order-finance/service";
import type {
  FinanceComponentInput,
  FinanceEventInput,
} from "@/lib/order-finance/types";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ShopOrder as WCOrderPayload } from "./api/types/wcorderSchema";

const SOURCE = "woocommerce_order_payload";
const SOURCE_API_VERSION = "woocommerce/wc-v3/orders";
const DEFAULT_FINANCE_SYNC_LIMIT = 100;

type WooCandidateOrder = {
  id: number;
  channelId: number;
  externalOrderId: string;
  rawData: Record<string, unknown> | null;
};

export async function syncWooCommerceOrderFinances(
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

  const candidates = await getCandidateOrders(userId, channelId, options);

  for (const order of candidates) {
    result.checked++;
    const payload = order.rawData as WCOrderPayload | null;
    if (!payload) {
      await markOrderFinanceStatus({
        orderId: order.id,
        channelId,
        source: SOURCE,
        status: "no_data",
      });
      result.noData++;
      continue;
    }

    const events = normalizeWooCommerceFinanceOrder(payload, order.externalOrderId);
    if (events.length === 0 || events.every((event) => event.components.length === 0)) {
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
      events,
    });
    result.synced++;
  }

  return result;
}

export function normalizeWooCommerceFinanceOrder(
  order: WCOrderPayload,
  externalOrderId: string,
): FinanceEventInput[] {
  const currency = order.currency ?? null;
  const components: FinanceComponentInput[] = [];

  for (const item of order.line_items ?? []) {
    const externalItemId = item.id ? String(item.id) : null;
    const sku = item.sku ?? null;
    const quantity = toInteger(item.quantity);

    pushAmount(components, {
      externalItemId,
      sku,
      quantity,
      amountRole: "principal",
      code: "line_total",
      amount: item.total,
      currency,
      rawData: item as Record<string, unknown>,
    });
    pushAmount(components, {
      externalItemId,
      sku,
      quantity,
      amountRole: "tax",
      code: "line_total_tax",
      amount: item.total_tax,
      currency,
      rawData: item as Record<string, unknown>,
    });
  }

  for (const line of order.shipping_lines ?? []) {
    pushAmount(components, {
      amountRole: "shipping_revenue",
      code: "shipping_total",
      amount: line.total,
      currency,
      rawData: line as Record<string, unknown>,
    });
    pushAmount(components, {
      amountRole: "tax",
      code: "shipping_total_tax",
      amount: line.total_tax,
      currency,
      rawData: line as Record<string, unknown>,
    });
  }

  for (const line of order.fee_lines ?? []) {
    pushAmount(components, {
      amountRole: "order_fee_revenue",
      code: "fee_total",
      amount: line.total,
      currency,
      rawData: line as Record<string, unknown>,
    });
    pushAmount(components, {
      amountRole: "tax",
      code: "fee_total_tax",
      amount: line.total_tax,
      currency,
      rawData: line as Record<string, unknown>,
    });
  }

  pushAmount(components, {
    amountRole: "discount",
    code: "discount_total",
    amount: order.discount_total,
    currency,
    rawData: { discount_total: order.discount_total },
    invertSign: true,
  });

  for (const refund of order.refunds ?? []) {
    pushAmount(components, {
      amountRole: "refund",
      code: "refund_total",
      amount: refund.total,
      currency,
      rawData: refund as Record<string, unknown>,
      forceNegative: true,
    });
  }

  return [
    {
      dedupeKey: `woocommerce:${externalOrderId}`,
      externalEventId: externalOrderId,
      eventType: "order_payload",
      eventStatus: order.status ?? null,
      postedAt: order.date_modified_gmt
        ? new Date(`${order.date_modified_gmt}Z`)
        : order.date_modified
          ? new Date(order.date_modified as unknown as string)
          : null,
      sourceApiVersion: SOURCE_API_VERSION,
      rawData: order as Record<string, unknown>,
      components,
    },
  ];
}

async function getCandidateOrders(
  userId: number,
  channelId: number,
  options: {
    orderId?: number;
    limit?: number;
    retryFailed?: boolean;
  },
): Promise<WooCandidateOrder[]> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_FINANCE_SYNC_LIMIT, 500));
  const retryStatusSql = options.retryFailed
    ? sql`('pending', 'no_data', 'failed')`
    : sql`('pending', 'no_data')`;

  return db
    .select({
      id: salesOrders.id,
      channelId: salesOrders.channelId,
      externalOrderId: salesOrders.externalOrderId,
      rawData: salesOrders.rawData,
    })
    .from(salesOrders)
    .innerJoin(
      channels,
      and(eq(channels.id, salesOrders.channelId), eq(channels.userId, userId)),
    )
    .where(
      and(
        eq(salesOrders.channelId, channelId),
        eq(channels.channelType, "woocommerce"),
        options.orderId ? eq(salesOrders.id, options.orderId) : undefined,
        inArray(salesOrders.status, [
          "pending",
          "processing",
          "on-hold",
          "packed",
          "shipped",
          "delivered",
          "returned",
          "refunded",
        ]),
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

function pushAmount(
  components: FinanceComponentInput[],
  input: Omit<FinanceComponentInput, "amount"> & {
    amount?: string | number | null;
    invertSign?: boolean;
    forceNegative?: boolean;
  },
): void {
  const amount = toAmount(input.amount, {
    invertSign: input.invertSign,
    forceNegative: input.forceNegative,
  });
  if (!amount) return;

  components.push({
    externalItemId: input.externalItemId,
    sku: input.sku,
    quantity: input.quantity,
    amountRole: input.amountRole,
    code: input.code,
    amount,
    currency: input.currency,
    rawData: input.rawData,
  });
}

function toAmount(
  value: string | number | null | undefined,
  options: { invertSign?: boolean; forceNegative?: boolean } = {},
): string | null {
  if (value === null || value === undefined || value === "") return null;
  let parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  if (options.invertSign) parsed = -parsed;
  if (options.forceNegative) parsed = -Math.abs(parsed);
  return parsed.toFixed(2);
}

function toInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}
