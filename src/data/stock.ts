import { db } from "@/db";
import { products, salesOrders } from "@/db/schema";
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
