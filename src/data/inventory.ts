import { db } from "@/db";
import { products, inventoryTransactions, purchaseInvoices } from "@/db/schema";
import { desc, eq, lte, sql } from "drizzle-orm";

export async function getInventoryStats() {
  const result = await db
    .select({
      totalProductsCount: sql<number>`count(*)::int`,
      totalValue: sql<string>`coalesce(sum(${products.quantityOnHand}::numeric * ${products.purchasePrice}), 0)`,
    })
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

export async function getInventoryTransactions(options: {
  limit: number;
  offset: number;
}) {
  const safeLimit = Math.min(Math.max(1, options.limit), 500);
  const safeOffset = Math.max(0, options.offset);

  const transactions = await db
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
    .offset(safeOffset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryTransactions);

  return { transactions, totalCount: count };
}
