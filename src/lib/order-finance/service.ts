import { db, type QueryClient } from "@/db";
import {
  type FinanceAmountRole,
  salesOrderFinanceComponents,
  salesOrderFinanceEvents,
  salesOrderFinanceSyncs,
  salesOrderItems,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import type {
  FinanceComponentInput,
  PersistOrderFinanceInput,
  OrderFinanceSummary,
} from "./types";

export type OrderFinanceComponentBreakdown = {
  amountRole: FinanceAmountRole;
  code: string;
  amount: number;
  currency: string | null;
};

export const PROFIT_ADJUSTMENT_ROLES = [
  "marketplace_fee",
  "payment_fee",
  "withholding",
  "adjustment",
  "other",
] as const;

type OrderItemLookupValue = {
  id: number;
  externalItemId: string;
  sku: string | null;
};

export async function persistOrderFinance(
  input: PersistOrderFinanceInput,
): Promise<void> {
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(salesOrderFinanceSyncs)
      .values({
        orderId: input.orderId,
        channelId: input.channelId,
        status: input.status,
        source: input.source,
        lastAttemptAt: now,
        syncedAt: input.status === "synced" ? now : null,
        nextAttemptAt: input.nextAttemptAt ?? null,
        lastErrorCode: input.error?.code ?? null,
        lastErrorMessage: input.error?.message ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: salesOrderFinanceSyncs.orderId,
        set: {
          status: input.status,
          source: input.source,
          lastAttemptAt: now,
          syncedAt: input.status === "synced" ? now : null,
          nextAttemptAt: input.nextAttemptAt ?? null,
          lastErrorCode: input.error?.code ?? null,
          lastErrorMessage: input.error?.message ?? null,
          updatedAt: now,
        },
      });

    const existingEvents = await tx
      .select({ id: salesOrderFinanceEvents.id })
      .from(salesOrderFinanceEvents)
      .where(
        and(
          eq(salesOrderFinanceEvents.orderId, input.orderId),
          eq(salesOrderFinanceEvents.channelId, input.channelId),
        ),
      );

    if (existingEvents.length > 0) {
      await tx
        .delete(salesOrderFinanceComponents)
        .where(
          inArray(
            salesOrderFinanceComponents.financeEventId,
            existingEvents.map((event) => event.id),
          ),
        );
      await tx
        .delete(salesOrderFinanceEvents)
        .where(
          and(
            eq(salesOrderFinanceEvents.orderId, input.orderId),
            eq(salesOrderFinanceEvents.channelId, input.channelId),
          ),
        );
    }

    if (input.events.length === 0) return;

    const itemLookup = await getOrderItemLookup(input.orderId, tx);

    for (const event of input.events) {
      const [insertedEvent] = await tx
        .insert(salesOrderFinanceEvents)
        .values({
          orderId: input.orderId,
          channelId: input.channelId,
          dedupeKey: event.dedupeKey,
          externalEventId: event.externalEventId ?? null,
          eventType: event.eventType,
          eventStatus: event.eventStatus ?? null,
          postedAt: event.postedAt ?? null,
          sourceApiVersion: event.sourceApiVersion,
          rawData: event.rawData,
          updatedAt: now,
        })
        .returning({ id: salesOrderFinanceEvents.id });

      if (event.components.length === 0) continue;

      await tx.insert(salesOrderFinanceComponents).values(
        event.components.map((component) => ({
          financeEventId: insertedEvent.id,
          orderItemId: resolveOrderItemId(component, itemLookup),
          externalItemId: component.externalItemId ?? null,
          sku: component.sku ?? null,
          amountRole: component.amountRole,
          code: component.code,
          amount: component.amount,
          currency: component.currency ?? null,
          quantity: component.quantity ?? null,
          rawData: component.rawData ?? {},
        })),
      );
    }
  });
}

export async function markOrderFinanceStatus(input: {
  orderId: number;
  channelId: number;
  source: string;
  status: "pending" | "no_data" | "failed" | "not_supported";
  nextAttemptAt?: Date | null;
  error?: { code?: string | null; message?: string | null };
}): Promise<void> {
  await persistOrderFinance({
    orderId: input.orderId,
    channelId: input.channelId,
    source: input.source,
    status: input.status,
    nextAttemptAt: input.nextAttemptAt,
    events: [],
    error: input.error,
  });
}

export async function getOrderFinanceSummary(
  userId: number,
  orderId: number,
): Promise<OrderFinanceSummary | null> {
  const rows = await db.execute(sql`
    WITH owned_order AS (
      SELECT so.id
      FROM sales_orders so
      JOIN channels c ON c.id = so.channel_id
      WHERE so.id = ${orderId}
        AND c.user_id = ${userId}
      LIMIT 1
    ),
    component_totals AS (
      SELECT
        coalesce(sum(sofc.amount::numeric) filter (where sofc.amount_role = 'principal'), 0) AS "principal",
        coalesce(sum(sofc.amount::numeric) filter (where sofc.amount_role = 'tax'), 0) AS "tax",
        coalesce(sum(sofc.amount::numeric) filter (where sofc.amount_role = 'shipping_revenue'), 0) AS "shippingRevenue",
        coalesce(sum(sofc.amount::numeric) filter (where sofc.amount_role = 'discount'), 0) AS "discount",
        coalesce(sum(sofc.amount::numeric) filter (where sofc.amount_role = 'order_fee_revenue'), 0) AS "orderFeeRevenue",
        coalesce(sum(sofc.amount::numeric) filter (where sofc.amount_role = 'marketplace_fee'), 0) AS "marketplaceFee",
        coalesce(sum(sofc.amount::numeric) filter (where sofc.amount_role = 'payment_fee'), 0) AS "paymentFee",
        coalesce(sum(sofc.amount::numeric) filter (where sofc.amount_role = 'withholding'), 0) AS "withholding",
        coalesce(sum(sofc.amount::numeric) filter (where sofc.amount_role = 'refund'), 0) AS "refund",
        coalesce(sum(sofc.amount::numeric) filter (where sofc.amount_role = 'adjustment'), 0) AS "adjustment",
        coalesce(sum(sofc.amount::numeric) filter (where sofc.amount_role = 'other'), 0) AS "other",
        coalesce(sum(sofc.amount::numeric) filter (
          where sofc.amount_role in ('marketplace_fee', 'payment_fee', 'withholding', 'adjustment', 'other')
        ), 0) AS "netProfitAdjustment"
      FROM sales_order_finance_events sofe
      JOIN sales_order_finance_components sofc ON sofc.finance_event_id = sofe.id
      WHERE sofe.order_id = ${orderId}
    ),
    event_summary AS (
      SELECT count(*)::int AS "eventCount", max(posted_at) AS "latestPostedAt"
      FROM sales_order_finance_events
      WHERE order_id = ${orderId}
    )
    SELECT
      sofs.status AS "syncStatus",
      sofs.source,
      sofs.last_attempt_at AS "lastAttemptAt",
      sofs.synced_at AS "syncedAt",
      sofs.last_error_code AS "lastErrorCode",
      sofs.last_error_message AS "lastErrorMessage",
      coalesce(event_summary."eventCount", 0)::int AS "eventCount",
      event_summary."latestPostedAt",
      component_totals.*
    FROM owned_order
    LEFT JOIN sales_order_finance_syncs sofs ON sofs.order_id = owned_order.id
    CROSS JOIN component_totals
    CROSS JOIN event_summary
  `);

  const row = rows[0] as unknown as OrderFinanceSummary | undefined;
  if (!row) return null;

  return {
    syncStatus: row.syncStatus,
    source: row.source,
    lastAttemptAt: toDate(row.lastAttemptAt),
    syncedAt: toDate(row.syncedAt),
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    eventCount: Number(row.eventCount ?? 0),
    latestPostedAt: toDate(row.latestPostedAt),
    principal: toNumber(row.principal),
    tax: toNumber(row.tax),
    shippingRevenue: toNumber(row.shippingRevenue),
    discount: toNumber(row.discount),
    orderFeeRevenue: toNumber(row.orderFeeRevenue),
    marketplaceFee: toNumber(row.marketplaceFee),
    paymentFee: toNumber(row.paymentFee),
    withholding: toNumber(row.withholding),
    refund: toNumber(row.refund),
    adjustment: toNumber(row.adjustment),
    other: toNumber(row.other),
    netProfitAdjustment: toNumber(row.netProfitAdjustment),
  };
}

export async function getFinanceProfitAdjustmentSql(
  userId: number,
  periodStart: string,
): Promise<number> {
  const [row] = await db.execute(sql`
    SELECT coalesce(sum(sofc.amount::numeric), 0) AS adjustment
    FROM sales_order_finance_components sofc
    JOIN sales_order_finance_events sofe ON sofe.id = sofc.finance_event_id
    JOIN sales_order_finance_syncs sofs ON sofs.order_id = sofe.order_id
    JOIN sales_orders so ON so.id = sofe.order_id
    JOIN channels c ON c.id = so.channel_id
    WHERE c.user_id = ${userId}
      AND sofs.status = 'synced'
      AND so.purchased_at >= ${periodStart}
      AND sofc.amount_role in ('marketplace_fee', 'payment_fee', 'withholding', 'adjustment', 'other')
  `);

  return toNumber((row as { adjustment?: string | number } | undefined)?.adjustment);
}

export async function getOrderFinanceComponentBreakdown(
  userId: number,
  orderId: number,
): Promise<OrderFinanceComponentBreakdown[]> {
  const rows = await db.execute(sql`
    SELECT
      sofc.amount_role AS "amountRole",
      sofc.code,
      sofc.currency,
      coalesce(sum(sofc.amount::numeric), 0) AS amount
    FROM sales_order_finance_components sofc
    JOIN sales_order_finance_events sofe ON sofe.id = sofc.finance_event_id
    JOIN sales_orders so ON so.id = sofe.order_id
    JOIN channels c ON c.id = so.channel_id
    WHERE c.user_id = ${userId}
      AND so.id = ${orderId}
    GROUP BY sofc.amount_role, sofc.code, sofc.currency
    ORDER BY
      CASE sofc.amount_role
        WHEN 'marketplace_fee' THEN 1
        WHEN 'payment_fee' THEN 2
        WHEN 'other' THEN 3
        ELSE 4
      END,
      abs(coalesce(sum(sofc.amount::numeric), 0)) DESC,
      sofc.code ASC
  `);

  return rows.map((row) => {
    const value = row as {
      amountRole: FinanceAmountRole;
      code: string;
      amount: string | number | null;
      currency: string | null;
    };

    return {
      amountRole: value.amountRole,
      code: value.code,
      amount: toNumber(value.amount),
      currency: value.currency,
    };
  });
}

async function getOrderItemLookup(
  orderId: number,
  tx: QueryClient,
): Promise<OrderItemLookupValue[]> {
  return tx
    .select({
      id: salesOrderItems.id,
      externalItemId: salesOrderItems.externalItemId,
      sku: salesOrderItems.sku,
    })
    .from(salesOrderItems)
    .where(eq(salesOrderItems.orderId, orderId));
}

function resolveOrderItemId(
  component: FinanceComponentInput,
  items: OrderItemLookupValue[],
): number | null {
  if (component.externalItemId) {
    const byExternalId = items.find(
      (item) => item.externalItemId === component.externalItemId,
    );
    if (byExternalId) return byExternalId.id;
  }

  if (component.sku) {
    const bySku = items.find((item) => item.sku === component.sku);
    if (bySku) return bySku.id;
  }

  return null;
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
