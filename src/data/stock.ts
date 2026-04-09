import { db } from "@/db";
import { products, stockReservations, salesOrders, salesOrderItems } from "@/db/schema";
import { and, eq, sql, desc } from "drizzle-orm";


/**
 * Get orders that have returned items pending admin inspection.
 */
export async function getOrdersAwaitingReturnAction() {
  return db
    .select({
      orderId: salesOrders.id,
      externalOrderId: salesOrders.externalOrderId,
      channelId: salesOrders.channelId,
      status: salesOrders.status,
      returnDisposition: salesOrders.returnDisposition,
      totalAmount: salesOrders.totalAmount,
      buyerName: salesOrders.buyerName,
      createdAt: salesOrders.createdAt,
    })
    .from(salesOrders)
    .where(eq(salesOrders.returnDisposition, "pending_inspection"))
    .orderBy(desc(salesOrders.createdAt));
}


/**
 * Get count of products with stock changes not synced to channels.
 * A product is out of sync if its available quantity differs from the last
 * pushed quantity. For now, we use reservedQuantity > 0 as a proxy signal
 * (since channels only know about quantityOnHand). In Phase 3, we'll add
 * a proper lastPushedQuantity column.
 */
export async function getOutOfSyncProductCount(): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        sql`${products.reservedQuantity} > 0`,
      ),
    );
  return result?.count ?? 0;
}

/**
 * Get the available quantity for a product (on-hand minus reserved).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getAvailableQuantity(productId: number): Promise<number> {
  const [row] = await db
    .select({
      quantityOnHand: products.quantityOnHand,
      reservedQuantity: products.reservedQuantity,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!row) return 0;
  return Math.max(0, row.quantityOnHand - row.reservedQuantity);
}

/**
 * Get active reservations for a specific order.
 */
export async function getReservationsForOrder(orderId: number) {
  return db
    .select({
      id: stockReservations.id,
      productId: stockReservations.productId,
      quantity: stockReservations.quantity,
      status: stockReservations.status,
      orderItemId: stockReservations.orderItemId,
      createdAt: stockReservations.createdAt,
      resolvedAt: stockReservations.resolvedAt,
    })
    .from(stockReservations)
    .where(eq(stockReservations.orderId, orderId));
}

/**
 * Get all active reservations for a product (to understand total reserved).
 */
export async function getActiveReservationsForProduct(productId: number) {
  return db
    .select({
      id: stockReservations.id,
      orderId: stockReservations.orderId,
      quantity: stockReservations.quantity,
      createdAt: stockReservations.createdAt,
    })
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.productId, productId),
        eq(stockReservations.status, "active"),
      ),
    )
    .orderBy(desc(stockReservations.createdAt));
}

/**
 * Get total quantity of all active stock reservations.
 */
export async function getTotalActiveReservations(): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`sum(${stockReservations.quantity})::int` })
    .from(stockReservations)
    .where(eq(stockReservations.status, "active"));
  return result?.count ?? 0;
}

/**
 * Get count of products where available stock has fallen to or below the reorder level.
 */
export async function getLowStockProductsCount(): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        sql`${products.quantityOnHand} - ${products.reservedQuantity} <= ${products.reorderLevel}`
      )
    );
  return result?.count ?? 0;
}

/**
 * Get recent sales orders across all channels.
 */
export async function getRecentOrders(limitCount = 5) {
  return db
    .select({
      id: salesOrders.id,
      externalOrderId: salesOrders.externalOrderId,
      channelId: salesOrders.channelId,
      status: salesOrders.status,
      totalAmount: salesOrders.totalAmount,
      currency: salesOrders.currency,
      buyerName: salesOrders.buyerName,
      purchasedAt: salesOrders.purchasedAt,
    })
    .from(salesOrders)
    .orderBy(desc(salesOrders.purchasedAt))
    .limit(limitCount);
}

/**
 * Get return details for a specific order (all items with return info).
 */
export async function getReturnItemsForOrder(orderId: number) {
  return db
    .select({
      id: salesOrderItems.id,
      productId: salesOrderItems.productId,
      title: salesOrderItems.title,
      sku: salesOrderItems.sku,
      quantity: salesOrderItems.quantity,
      returnQuantity: salesOrderItems.returnQuantity,
      returnDisposition: salesOrderItems.returnDisposition,
      price: salesOrderItems.price,
    })
    .from(salesOrderItems)
    .where(eq(salesOrderItems.orderId, orderId));
}

/**
 * Get product stock summary with available quantity.
 */
export async function getProductStockSummary(productId: number) {
  const [row] = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      isActive: products.isActive,
      category: products.category,
      unit: products.unit,
      purchasePrice: products.purchasePrice,
      sellingPrice: products.sellingPrice,
      quantityOnHand: products.quantityOnHand,
      reservedQuantity: products.reservedQuantity,
      reorderLevel: products.reorderLevel,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    availableQuantity: Math.max(0, row.quantityOnHand - row.reservedQuantity),
  };
}
