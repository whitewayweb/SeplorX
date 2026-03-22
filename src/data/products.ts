import { db, type QueryClient } from "@/db";
import {
  products,
  channelProductMappings,
  inventoryTransactions,
  purchaseInvoiceItems,
  purchaseInvoices,
  companies,
  channels,
  channelProducts,
} from "@/db/schema";
import { and, desc, eq, sql, or } from "drizzle-orm";

export async function getProductById(productId: number, tx: QueryClient = db) {
  const result = await tx
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
      attributes: products.attributes,
      createdAt: products.createdAt,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  return result[0];
}

export async function getProductMappings(productId: number, tx: QueryClient = db) {
  return await tx
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

export async function getInventoryTransactionsForProduct(productId: number, tx: QueryClient = db) {
  return await tx
    .select({
      id: inventoryTransactions.id,
      type: inventoryTransactions.type,
      quantity: inventoryTransactions.quantity,
      referenceType: inventoryTransactions.referenceType,
      referenceId: inventoryTransactions.referenceId,
      notes: inventoryTransactions.notes,
      createdAt: inventoryTransactions.createdAt,
      companyId: purchaseInvoices.companyId,
    })
    .from(inventoryTransactions)
    .leftJoin(purchaseInvoices, eq(inventoryTransactions.referenceId, purchaseInvoices.id))
    .where(eq(inventoryTransactions.productId, productId))
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(50);
}

export async function getProductPurchaseHistory(productId: number, tx: QueryClient = db) {
  return await tx
    .select({
      id: purchaseInvoiceItems.id,
      invoiceId: purchaseInvoices.id,
      invoiceNumber: purchaseInvoices.invoiceNumber,
      invoiceDate: purchaseInvoices.invoiceDate,
      companyId: companies.id,
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

export async function getProductsList(tx: QueryClient = db) {
  return await tx
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

export async function getActiveProductsForDropdown(tx: QueryClient = db) {
  return await tx
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

export async function getProductQuantity(productId: number, tx: QueryClient = db) {
  const productRows = await tx
    .select({ quantityOnHand: products.quantityOnHand })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  return productRows.length > 0 ? productRows[0].quantityOnHand : null;
}

export async function getChannelMappingsForStockPush(
  userId: number,
  productId: number,
  tx: QueryClient = db,
) {
  return await tx
    .select({
      mappingId: channelProductMappings.id,
      channelId: channelProductMappings.channelId,
      externalProductId: channelProductMappings.externalProductId,
      label: channelProductMappings.label,
      channelType: channels.channelType,
      storeUrl: channels.storeUrl,
      credentials: channels.credentials,
      channelName: channels.name,
      status: channels.status,
    })
    .from(channelProductMappings)
    .innerJoin(channels, eq(channelProductMappings.channelId, channels.id))
    .where(
      and(
        eq(channelProductMappings.productId, productId),
        eq(channels.userId, userId),
        eq(channels.status, "connected"),
      ),
    );
}

export async function getConnectedChannel(userId: number, channelId: number, tx: QueryClient = db) {
  const channelRows = await tx
    .select({
      id: channels.id,
      status: channels.status,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  return channelRows.length > 0 ? channelRows[0] : null;
}

export async function getExternalProducts(
  channelId: number,
  search?: string,
  limit: number = 50,
  offset: number = 0,
  tx: QueryClient = db,
) {
  return await tx
    .select({
      id: channelProducts.externalId,
      name: channelProducts.name,
      sku: channelProducts.sku,
      stockQuantity: channelProducts.stockQuantity,
      type: channelProducts.type,
      rawPayload: channelProducts.rawData,
      parentId: sql<
        string | null
      >`COALESCE(raw_data->>'parentId', CAST(raw_data->>'parent_id' AS TEXT))`,
    })
    .from(channelProducts)
    .where(
      and(
        eq(channelProducts.channelId, channelId),
        search && search.trim() !== ""
          ? or(
              sql`${channelProducts.name} ILIKE ${`%${search}%`}`,
              sql`${channelProducts.sku} ILIKE ${`%${search}%`}`,
            )
          : undefined,
      ),
    )
    .orderBy(channelProducts.externalId)
    .limit(limit)
    .offset(offset);
}

export async function getExistingMappingsForChannel(channelId: number, tx: QueryClient = db) {
  return await tx
    .select({
      externalProductId: channelProductMappings.externalProductId,
      productId: channelProductMappings.productId,
      productName: products.name,
    })
    .from(channelProductMappings)
    .innerJoin(products, eq(channelProductMappings.productId, products.id))
    .where(eq(channelProductMappings.channelId, channelId));
}

export async function insertChannelMappingQuietly(
  channelId: number,
  productId: number,
  externalProductId: string,
  label: string | null,
  tx: QueryClient = db,
) {
  return await tx
    .insert(channelProductMappings)
    .values({
      channelId,
      productId,
      externalProductId,
      label,
    })
    .onConflictDoNothing()
    .returning({ id: channelProductMappings.id });
}

export async function getUniqueAttributeKeys(tx: QueryClient = db) {
  const result = await tx.execute(sql`
    SELECT key, count(*)::int as count
    FROM ${products}, jsonb_object_keys(${products.attributes}) as key
    GROUP BY key
    ORDER BY count DESC
  `);
  return result as unknown as { key: string; count: number }[];
}

export async function getAttributeValues(key: string, tx: QueryClient = db) {
  const result = await tx.execute(sql`
    SELECT ${products.attributes}->>${key} as value, count(*)::int as count
    FROM ${products}
    WHERE ${products.attributes} ? ${key}
    GROUP BY value
    ORDER BY count DESC
  `);
  return result as unknown as { value: string; count: number }[];
}
