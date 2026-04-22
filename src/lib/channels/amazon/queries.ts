import { sql, eq, desc, and, or, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { channelProducts, salesOrders, salesOrderItems, channels, type SalesOrderStatus } from "@/db/schema";
import { getDistinctChannelProductField } from "../queries";

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

// Type-only import — OrdersV0Schema is an interface, not a runtime value.
import type { OrdersV0Schema } from "./api/types/ordersV0Schema";

/**
 * Returns the Drizzle SQL expression to extract a given filter field (e.g. "brand", "category") 
 * from the channel_products.raw_data JSONB column. Used by the DAL for filtering and grouping.
 */
export function extractSqlField(fieldName: "brand" | "category" | string) {
  if (fieldName === "brand") {
    return sql<string>`NULLIF(${channelProducts.rawData}->'summaries'->0->>'brand', '')`;
  }
  if (fieldName === "category") {
    // Tries to pull the website display group (like "Auto Accessory") as a category
    return sql<string>`NULLIF(${channelProducts.rawData}->'summaries'->0->>'websiteDisplayGroup', '')`;
  }
  if (fieldName === "price") {
    return sql<string>`${channelProducts.rawData}->>'price'`;
  }
  if (fieldName === "itemCondition") {
    return sql<string>`${channelProducts.rawData}->>'item-condition'`;
  }
  if (fieldName === "partNumber") {
    return sql<string>`NULLIF(${channelProducts.rawData}->'summaries'->0->>'partNumber', '')`;
  }
  return null;
}

/**
 * Convenience method to get distinct brands for an Amazon channel instance
 */
export async function getBrands(channelId: number): Promise<string[]> {
  const expr = extractSqlField("brand");
  return expr ? getDistinctChannelProductField(channelId, expr) : [];
}

// ─── Orders DAL ────────────────────────────────────────────────────────────

export interface OrderRow {
  id: number;
  externalOrderId: string | null;
  status: string | null;
  totalAmount: string | null;
  currency: string | null;
  buyerName: string | null;
  purchasedAt: Date | null;
  channelName: string | null;
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
  /** Stored as the full OrderItem shape from the Amazon SP-API. */
  rawData: OrdersV0Schema["OrderItem"] | null;
  channelProductId: number | null;
  productName: string | null;
  productSku: string | null;
  productId: number | null;
  returnQuantity: number;
  returnDisposition: string | null;
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
      externalOrderId: salesOrders.externalOrderId,
      status: salesOrders.status,
      totalAmount: salesOrders.totalAmount,
      currency: salesOrders.currency,
      buyerName: salesOrders.buyerName,
      purchasedAt: salesOrders.purchasedAt,
      channelName: channels.name,
    })
    .from(salesOrders)
    .innerJoin(channels, eq(salesOrders.channelId, channels.id))
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
      externalOrderId: salesOrders.externalOrderId,
      status: salesOrders.status,
      totalAmount: salesOrders.totalAmount,
      currency: salesOrders.currency,
      buyerName: salesOrders.buyerName,
      purchasedAt: salesOrders.purchasedAt,
      channelName: channels.name,
    })
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
      // Extract only the sub-fields the page actually renders — avoids shipping
      // the full rawData blob across the network.
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

export async function getOrderItems(userId: number, orderId: number): Promise<OrderItemRow[]> {
  const rows = await db
    .select({
      id: salesOrderItems.id,
      externalItemId: salesOrderItems.externalItemId,
      sku: salesOrderItems.sku,
      title: salesOrderItems.title,
      quantity: salesOrderItems.quantity,
      price: salesOrderItems.price,
      rawData: salesOrderItems.rawData,
      productId: salesOrderItems.productId,
      returnQuantity: salesOrderItems.returnQuantity,
      returnDisposition: salesOrderItems.returnDisposition,
      channelProductId: channelProducts.id,
      productName: channelProducts.name,
      productSku: channelProducts.sku,
    })
    .from(salesOrderItems)
    // innerJoin enforces ownership: orderId must belong to a channel owned by userId
    .innerJoin(
      salesOrders,
      and(
        eq(salesOrderItems.orderId, salesOrders.id),
        // ownership scope via channel join
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
          // Match by SKU (stored as top-level column)
          eq(channelProducts.sku, salesOrderItems.sku),
          // Match by ASIN (stored as externalId) using JSONB extraction from OrderItem payload
          sql`${channelProducts.externalId} = (${salesOrderItems.rawData}->>'ASIN')`,
          // Fallback: Match by ASIN via the externalId column directly if it was saved there
          eq(channelProducts.externalId, salesOrderItems.sku || "")
        )
      )
    )
    .where(eq(salesOrderItems.orderId, orderId));

  // Deduplicate in case leftJoin matched multiple channel products for the same SKU
  // (e.g. variations or duplicate listings in the channel)
  const uniqueItems = new Map<number, typeof rows[0]>();
  for (const row of rows) {
    if (!uniqueItems.has(row.id)) {
      uniqueItems.set(row.id, row);
    }
  }

  return Array.from(uniqueItems.values()) as unknown as OrderItemRow[];
}



export { getLastSyncDate } from "../queries";

/** 
 * @deprecated Use getLastSyncDate instead.
 * Get the date of the most recent order for a specific channel. 
 */
async function getLastOrderDate(channelId: number): Promise<Date | null> {
  const [row] = await db
    .select({ purchasedAt: salesOrders.purchasedAt })
    .from(salesOrders)
    .where(eq(salesOrders.channelId, channelId))
    .orderBy(desc(salesOrders.purchasedAt))
    .limit(1);

  return row?.purchasedAt ?? null;
}




