import { db } from "@/db";
import { products, inventoryTransactions, purchaseInvoices } from "@/db/schema";
import { desc, eq, lte, sql } from "drizzle-orm";
import { durationMs, startTimer } from "@/lib/debug-timing";
import { logger } from "@/lib/logger";

export async function getTotalActiveProductsCount() {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.isActive, true));
  return result[0];
}

export async function getLowStockProducts() {
  return await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      unit: products.unit,
      quantityOnHand: products.quantityOnHand,
      reservedQuantity: products.reservedQuantity,
      reorderLevel: products.reorderLevel,
    })
    .from(products)
    .where(lte(products.quantityOnHand, products.reorderLevel))
    .orderBy(products.quantityOnHand);
}

export async function getTotalStockValue() {
  const result = await db
    .select({
      totalValue: sql<string>`coalesce(sum(${products.quantityOnHand}::numeric * ${products.purchasePrice}), 0)`,
    })
    .from(products)
    .where(eq(products.isActive, true));
  return result[0];
}

export async function getInventoryTransactions(options: {
  limit: number;
  offset: number;
}) {
  const safeLimit = Math.min(Math.max(1, options.limit), 500);
  const safeOffset = Math.max(0, options.offset);
  const startedAt = startTimer();
  logger.info("[inventory-data] getInventoryTransactions start", {
    limit: safeLimit,
    offset: safeOffset,
  });

  const transactionsPromise = db
    .select({
      id: inventoryTransactions.id,
      productId: inventoryTransactions.productId,
      type: inventoryTransactions.type,
      quantity: inventoryTransactions.quantity,
      referenceType: inventoryTransactions.referenceType,
      referenceId: inventoryTransactions.referenceId,
      notes: inventoryTransactions.notes,
      createdAt: inventoryTransactions.createdAt,
      productName: products.name,
      companyId: purchaseInvoices.companyId,
    })
    .from(inventoryTransactions)
    .innerJoin(products, eq(inventoryTransactions.productId, products.id))
    .leftJoin(purchaseInvoices, eq(inventoryTransactions.referenceId, purchaseInvoices.id))
    .orderBy(desc(inventoryTransactions.createdAt), desc(inventoryTransactions.id))
    .limit(safeLimit)
    .offset(safeOffset)
    .then((rows) => {
      logger.info("[inventory-data] getInventoryTransactions rows complete", {
        durationMs: durationMs(startedAt),
        rowCount: rows.length,
      });
      return rows;
    });

  const countPromise = db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryTransactions)
    .then((rows) => {
      logger.info("[inventory-data] getInventoryTransactions count complete", {
        durationMs: durationMs(startedAt),
        count: rows[0]?.count ?? 0,
      });
      return rows;
    });

  const [transactions, [{ count }]] = await Promise.all([
    transactionsPromise,
    countPromise,
  ]);

  logger.info("[inventory-data] getInventoryTransactions complete", {
    durationMs: durationMs(startedAt),
  });

  return { transactions, totalCount: count };
}
