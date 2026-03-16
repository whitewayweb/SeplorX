import { sql, eq, desc, and, or } from "drizzle-orm";
import { db } from "@/db";
import { channelProducts, salesOrders, salesOrderItems, channels } from "@/db/schema";
import { getDistinctChannelProductField } from "../queries";

// Use the generated types directly
import OrdersV0Schema from "./api/types/ordersV0Schema";

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
  rawData: Record<string, unknown> | {
    order?: OrdersV0Schema["Order"];
    buyerInfo?: OrdersV0Schema["OrderBuyerInfo"];
    shippingAddress?: OrdersV0Schema["OrderAddress"];
  } | null;
}

export interface OrderItemRow {
  id: number;
  externalItemId: string | null;
  sku: string | null;
  title: string | null;
  quantity: number;
  price: string | null;
  rawData: Record<string, unknown> | OrdersV0Schema["OrderItem"] | null;
  channelProductId: number | null;
  productName: string | null;
  productSku: string | null;
}

export interface ChannelRow {
  id: number;
  name: string;
}

/** All orders across all channels for a user (joined with channel name). */
export async function getAllOrders(userId: number): Promise<OrderRow[]> {
  return db
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
    .where(eq(channels.userId, userId))
    .orderBy(desc(salesOrders.purchasedAt));
}

/** Orders for a single channel, scoped to the authenticated user (IDOR-safe). */
export async function getOrdersByChannel(
  userId: number,
  channelId: number
): Promise<OrderRow[]> {
  return db
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
    .where(eq(salesOrders.channelId, channelId))
    .orderBy(desc(salesOrders.purchasedAt));
}

/** Single order detail — IDOR-safe via user-scoped channel join. */
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
      rawData: salesOrders.rawData,
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

/** Order items joined with matched channel product. */
export async function getOrderItems(orderId: number): Promise<OrderItemRow[]> {
  return db
    .select({
      id: salesOrderItems.id,
      externalItemId: salesOrderItems.externalItemId,
      sku: salesOrderItems.sku,
      title: salesOrderItems.title,
      quantity: salesOrderItems.quantity,
      price: salesOrderItems.price,
      rawData: salesOrderItems.rawData,
      channelProductId: channelProducts.id,
      productName: channelProducts.name,
      productSku: channelProducts.sku,
    })
    .from(salesOrderItems)
    .innerJoin(salesOrders, eq(salesOrderItems.orderId, salesOrders.id))
    .leftJoin(
      channelProducts,
      and(
        eq(channelProducts.channelId, salesOrders.channelId),
        or(
          eq(channelProducts.sku, salesOrderItems.sku),
          sql`${channelProducts.externalId} = ${salesOrderItems.rawData}->>'ASIN'`
        )
      )
    )
    .where(eq(salesOrderItems.orderId, orderId));
}

/** All channels for a user — used to show Fetch buttons for each channel. */
export async function getAmazonChannelsForUser(userId: number): Promise<ChannelRow[]> {
  return db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(eq(channels.userId, userId));
}
