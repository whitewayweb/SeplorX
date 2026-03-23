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
