import { db } from "@/db";
import { products, inventoryTransactions } from "@/db/schema";
import { desc, eq, lte, sql } from "drizzle-orm";

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

export async function getRecentInventoryTransactions() {
  return await db
    .select({
      id: inventoryTransactions.id,
      productId: inventoryTransactions.productId,
      type: inventoryTransactions.type,
      quantity: inventoryTransactions.quantity,
      referenceType: inventoryTransactions.referenceType,
      notes: inventoryTransactions.notes,
      createdAt: inventoryTransactions.createdAt,
      productName: products.name,
    })
    .from(inventoryTransactions)
    .innerJoin(products, eq(inventoryTransactions.productId, products.id))
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(20);
}
