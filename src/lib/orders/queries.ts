import { sql, eq, desc, and, or, gte, lte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  channelProducts,
  salesOrderFinanceSyncs,
  salesOrders,
  salesOrderItems,
  channels,
  type FinanceSyncStatus,
  type SalesOrderStatus,
} from "@/db/schema";
import type { OrdersV0Schema } from "@/lib/channels/amazon/api/types/ordersV0Schema";

function getStatusFilter(status?: string) {
  if (!status || status === "all") return undefined;
  return eq(salesOrders.status, status as SalesOrderStatus);
}

/** Helper to apply date filter consistently across queries */
function getDateFilter(dateFrom?: Date, dateTo?: Date) {
  if (dateFrom && dateTo) {
    return and(gte(salesOrders.purchasedAt, dateFrom), lte(salesOrders.purchasedAt, dateTo));
  }
  if (dateFrom) return gte(salesOrders.purchasedAt, dateFrom);
  if (dateTo) return lte(salesOrders.purchasedAt, dateTo);
  return undefined;
}

export interface OrderRow {
  id: number;
  channelId: number;
  externalOrderId: string | null;
  status: string | null;
  totalAmount: string | null;
  currency: string | null;
  buyerName: string | null;
  purchasedAt: Date | null;
  channelName: string | null;
  financeSyncStatus: FinanceSyncStatus | null;
  financeSyncedAt: Date | null;
  financeNextAttemptAt: Date | null;
}

export interface OrderDetail {
  id: number;
  externalOrderId: string | null;
  status: string | null;
  totalAmount: string | null;
  currency: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  purchasedAt: Date | null;
  channelId: number;
  channelName: string | null;
  channelType: string;
  returnDisposition: string | null;
  /** Extracted sub-fields from rawData JSONB — only what the UI needs. */
  rawOrder: OrdersV0Schema["Order"] | null;
  shippingAddress: OrdersV0Schema["OrderAddress"] | null;
}

export interface OrderItemRow {
  id: number;
  externalItemId: string | null;
  sku: string | null;
  title: string | null;
  quantity: number;
  price: string | null;
  unitCost: string | null;
  costSource: string | null;
  costCapturedAt: Date | null;
  /** Stored as the full OrderItem shape from the Amazon SP-API. */
  rawData: OrdersV0Schema["OrderItem"] | null;
  channelProductId: number | null;
  productName: string | null;
  productSku: string | null;
  productId: number | null;
  returnQuantity: number;
  returnDisposition: string | null;
  productRawData: unknown | null;
}

/** All orders across all channels for a user (joined with channel name). */
export async function getAllOrders(
  userId: number,
  limit = 50,
  offset = 0,
  status?: string,
  dateFrom?: Date,
  dateTo?: Date
): Promise<OrderRow[]> {
  const query = db
    .select({
      id: salesOrders.id,
      channelId: salesOrders.channelId,
      externalOrderId: salesOrders.externalOrderId,
      status: salesOrders.status,
      totalAmount: salesOrders.totalAmount,
      currency: salesOrders.currency,
      buyerName: salesOrders.buyerName,
      purchasedAt: salesOrders.purchasedAt,
      channelName: channels.name,
      financeSyncStatus: salesOrderFinanceSyncs.status,
      financeSyncedAt: salesOrderFinanceSyncs.syncedAt,
      financeNextAttemptAt: salesOrderFinanceSyncs.nextAttemptAt,
    })
    .from(salesOrders)
    .innerJoin(channels, eq(salesOrders.channelId, channels.id))
    .leftJoin(salesOrderFinanceSyncs, eq(salesOrderFinanceSyncs.orderId, salesOrders.id))
    .where(
      and(
        eq(channels.userId, userId),
        getStatusFilter(status),
        getDateFilter(dateFrom, dateTo)
      )
    )
    .orderBy(desc(salesOrders.purchasedAt))
    .limit(limit)
    .offset(offset);

  return query;
}

/** Total count of all orders across all channels for a user. */
export async function countAllOrders(
  userId: number,
  status?: string,
  dateFrom?: Date,
  dateTo?: Date
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(salesOrders)
    .innerJoin(channels, eq(salesOrders.channelId, channels.id))
    .where(
      and(
        eq(channels.userId, userId),
        getStatusFilter(status),
        getDateFilter(dateFrom, dateTo)
      )
    );
  return Number(row?.count ?? 0);
}

/** Grouped count of orders by status for a user's channel(s) */
export async function getOrderStatusCounts(
  userId: number,
  channelId?: number,
  dateFrom?: Date,
  dateTo?: Date
): Promise<Record<string, number>> {
  const results = await db
    .select({ status: salesOrders.status, count: sql<number>`count(*)` })
    .from(salesOrders)
    .innerJoin(channels, eq(salesOrders.channelId, channels.id))
    .where(
      and(
        channelId ? eq(salesOrders.channelId, channelId) : undefined,
        eq(channels.userId, userId),
        getDateFilter(dateFrom, dateTo)
      )
    )
    .groupBy(salesOrders.status);

  return results.reduce((acc, row) => {
    acc[row.status] = Number(row.count);
    return acc;
  }, {} as Record<string, number>);
}

export async function getOrdersByChannel(
  userId: number,
  channelId: number,
  limit = 50,
  offset = 0,
  status?: string,
  dateFrom?: Date,
  dateTo?: Date
): Promise<OrderRow[]> {
  const query = db
    .select({
      id: salesOrders.id,
      channelId: salesOrders.channelId,
      externalOrderId: salesOrders.externalOrderId,
      status: salesOrders.status,
      totalAmount: salesOrders.totalAmount,
      currency: salesOrders.currency,
      buyerName: salesOrders.buyerName,
      purchasedAt: salesOrders.purchasedAt,
      channelName: channels.name,
      financeSyncStatus: salesOrderFinanceSyncs.status,
      financeSyncedAt: salesOrderFinanceSyncs.syncedAt,
      financeNextAttemptAt: salesOrderFinanceSyncs.nextAttemptAt,
    })
    .from(salesOrders)
    .innerJoin(
      channels,
      and(eq(salesOrders.channelId, channels.id), eq(channels.userId, userId))
    )
    .leftJoin(salesOrderFinanceSyncs, eq(salesOrderFinanceSyncs.orderId, salesOrders.id))
    .where(
      and(
        eq(salesOrders.channelId, channelId),
        getStatusFilter(status),
        getDateFilter(dateFrom, dateTo)
      )
    )
    .orderBy(desc(salesOrders.purchasedAt))
    .limit(limit)
    .offset(offset);

  return query;
}

export async function countOrdersByChannel(
  userId: number,
  channelId: number,
  status?: string,
  dateFrom?: Date,
  dateTo?: Date
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(salesOrders)
    .innerJoin(
      channels,
      and(eq(salesOrders.channelId, channels.id), eq(channels.userId, userId))
    )
    .where(
      and(
        eq(salesOrders.channelId, channelId),
        getStatusFilter(status),
        getDateFilter(dateFrom, dateTo)
      )
    );
  return Number(row?.count ?? 0);
}

/** Single order detail — IDOR-safe via user-scoped channel join.
 * Only the sub-fields the UI needs are extracted from rawData JSONB.
 */
export async function getOrderDetail(
  userId: number,
  orderId: number
): Promise<OrderDetail | null> {
  const [row] = await db
    .select({
      id: salesOrders.id,
      externalOrderId: salesOrders.externalOrderId,
      status: salesOrders.status,
      totalAmount: salesOrders.totalAmount,
      currency: salesOrders.currency,
      buyerName: salesOrders.buyerName,
      buyerEmail: salesOrders.buyerEmail,
      purchasedAt: salesOrders.purchasedAt,
      channelId: salesOrders.channelId,
      channelName: channels.name,
      channelType: channels.channelType,
      rawOrder: sql<OrdersV0Schema["Order"] | null>`(${salesOrders.rawData}->>'order')::jsonb`,
      shippingAddress: sql<OrdersV0Schema["OrderAddress"] | null>`(${salesOrders.rawData}->>'shippingAddress')::jsonb`,
      returnDisposition: salesOrders.returnDisposition,
    })
    .from(salesOrders)
    .innerJoin(
      channels,
      and(eq(salesOrders.channelId, channels.id), eq(channels.userId, userId))
    )
    .where(eq(salesOrders.id, orderId))
    .limit(1);

  if (!row) return null;
  return row as OrderDetail;
}

export async function getOrderItemsBulk(userId: number, orderIds: number[]): Promise<Map<number, OrderItemRow[]>> {
  if (orderIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: salesOrderItems.id,
      externalItemId: salesOrderItems.externalItemId,
      sku: salesOrderItems.sku,
      title: salesOrderItems.title,
      quantity: salesOrderItems.quantity,
      price: salesOrderItems.price,
      unitCost: salesOrderItems.unitCost,
      costSource: salesOrderItems.costSource,
      costCapturedAt: salesOrderItems.costCapturedAt,
      rawData: salesOrderItems.rawData,
      productId: salesOrderItems.productId,
      returnQuantity: salesOrderItems.returnQuantity,
      returnDisposition: salesOrderItems.returnDisposition,
      channelProductId: channelProducts.id,
      productName: channelProducts.name,
      productSku: channelProducts.sku,
      productRawData: channelProducts.rawData,
      orderId: salesOrderItems.orderId,
    })
    .from(salesOrderItems)
    .innerJoin(
      salesOrders,
      and(
        eq(salesOrderItems.orderId, salesOrders.id),
        sql`${salesOrders.channelId} IN (
          SELECT id FROM ${channels} WHERE user_id = ${userId}
        )`
      )
    )
    .leftJoin(
      channelProducts,
      and(
        eq(channelProducts.channelId, salesOrders.channelId),
        or(
          eq(channelProducts.sku, salesOrderItems.sku),
          sql`${channelProducts.externalId} = (${salesOrderItems.rawData}->>'ASIN')`,
          eq(channelProducts.externalId, salesOrderItems.sku || "")
        )
      )
    )
    .where(inArray(salesOrderItems.orderId, orderIds));

  const uniqueItems = new Map<number, typeof rows[0]>();
  for (const row of rows) {
    if (!uniqueItems.has(row.id)) {
      uniqueItems.set(row.id, row);
    }
  }

  const itemsByOrderId = new Map<number, OrderItemRow[]>();
  for (const row of Array.from(uniqueItems.values())) {
    const arr = itemsByOrderId.get(row.orderId!) || [];
    // @ts-expect-error Drizzle inference is incomplete for aliased items in Map
    arr.push(row);
    itemsByOrderId.set(row.orderId!, arr);
  }

  return itemsByOrderId;
}

export async function getOrderItems(userId: number, orderId: number): Promise<OrderItemRow[]> {
  const map = await getOrderItemsBulk(userId, [orderId]);
  return map.get(orderId) || [];
}

export async function attachItemsToOrders<T extends OrderRow>(userId: number, orders: T[]): Promise<(T & { items: OrderItemRow[] })[]> {
  if (orders.length === 0) return [];
  const orderIds = orders.map(o => o.id);
  const orderItems = await getOrderItemsBulk(userId, orderIds);
  return orders.map(order => ({
    ...order,
    items: orderItems.get(order.id) || []
  }));
}
