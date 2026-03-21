import { db } from "@/db";
import {
  products,
  channelProductMappings,
  inventoryTransactions,
  purchaseInvoiceItems,
  purchaseInvoices,
  companies
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function getProductById(productId: number) {
  const result = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      isActive: products.isActive,
      unit: products.unit,
      category: products.category,
      purchasePrice: products.purchasePrice,
      sellingPrice: products.sellingPrice,
      quantityOnHand: products.quantityOnHand,
      reorderLevel: products.reorderLevel,
      description: products.description,
      createdAt: products.createdAt,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
    
  return result[0];
}

export async function getProductMappings(productId: number) {
  return await db
    .select({
      id: channelProductMappings.id,
      channelId: channelProductMappings.channelId,
      externalProductId: channelProductMappings.externalProductId,
      label: channelProductMappings.label,
      syncStatus: channelProductMappings.syncStatus,
    })
    .from(channelProductMappings)
    .where(eq(channelProductMappings.productId, productId));
}

export async function getInventoryTransactionsForProduct(productId: number) {
  return await db
    .select({
      id: inventoryTransactions.id,
      type: inventoryTransactions.type,
      quantity: inventoryTransactions.quantity,
      referenceType: inventoryTransactions.referenceType,
      referenceId: inventoryTransactions.referenceId,
      notes: inventoryTransactions.notes,
      createdAt: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .where(eq(inventoryTransactions.productId, productId))
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(50);
}

export async function getProductPurchaseHistory(productId: number) {
  return await db
    .select({
      id: purchaseInvoiceItems.id,
      invoiceId: purchaseInvoices.id,
      invoiceNumber: purchaseInvoices.invoiceNumber,
      invoiceDate: purchaseInvoices.invoiceDate,
      companyName: companies.name,
      quantity: purchaseInvoiceItems.quantity,
      unitPrice: purchaseInvoiceItems.unitPrice,
    })
    .from(purchaseInvoiceItems)
    .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
    .innerJoin(companies, eq(purchaseInvoices.companyId, companies.id))
    .where(eq(purchaseInvoiceItems.productId, productId))
    .orderBy(desc(purchaseInvoices.invoiceDate))
    .limit(20);
}

export async function getProductsList() {
  return await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      category: products.category,
      unit: products.unit,
      purchasePrice: products.purchasePrice,
      sellingPrice: products.sellingPrice,
      reorderLevel: products.reorderLevel,
      quantityOnHand: products.quantityOnHand,
      isActive: products.isActive,
    })
    .from(products)
    .orderBy(desc(products.createdAt));
}

export async function getActiveProductsForDropdown() {
  return await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      purchasePrice: products.purchasePrice,
      unit: products.unit,
    })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(products.name);
}
