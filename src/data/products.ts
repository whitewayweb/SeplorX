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
import { and, desc, eq, ne, sql, count } from "drizzle-orm";

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
      reservedQuantity: products.reservedQuantity,
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
      channelStock: channelProducts.stockQuantity,
    })
    .from(channelProductMappings)
    .leftJoin(
      channelProducts,
      and(
        eq(channelProductMappings.channelId, channelProducts.channelId),
        eq(channelProductMappings.externalProductId, channelProducts.externalId)
      )
    )
    .where(eq(channelProductMappings.productId, productId));
}

export interface PendingStockSyncMapping {
  id: number;
  channelId: number;
  channelName: string;
  channelType: string;
  externalProductId: string;
  label: string | null;
  syncStatus: string;
  lastSyncError: string | null;
  channelStock: number | null;
}

export interface PendingStockSyncProduct {
  id: number;
  name: string;
  sku: string | null;
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number;
  reorderLevel: number;
  lastTransactionAt: Date | null;
  lastTransactionNotes: string | null;
  mappings: PendingStockSyncMapping[];
}

export async function getPendingStockSyncProducts(userId: number, tx: QueryClient = db): Promise<PendingStockSyncProduct[]> {
  const rows = await tx
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      quantityOnHand: products.quantityOnHand,
      reservedQuantity: products.reservedQuantity,
      reorderLevel: products.reorderLevel,
      mappingId: channelProductMappings.id,
      channelId: channelProductMappings.channelId,
      channelName: channels.name,
      channelType: channels.channelType,
      externalProductId: channelProductMappings.externalProductId,
      label: channelProductMappings.label,
      syncStatus: channelProductMappings.syncStatus,
      lastSyncError: channelProductMappings.lastSyncError,
      channelStock: channelProducts.stockQuantity,
      lastTransactionAt: sql<Date | null>`(
        SELECT ${inventoryTransactions.createdAt}
        FROM ${inventoryTransactions}
        WHERE ${inventoryTransactions.productId} = ${products.id}
        ORDER BY ${inventoryTransactions.createdAt} DESC
        LIMIT 1
      )`,
      lastTransactionNotes: sql<string | null>`(
        SELECT ${inventoryTransactions.notes}
        FROM ${inventoryTransactions}
        WHERE ${inventoryTransactions.productId} = ${products.id}
        ORDER BY ${inventoryTransactions.createdAt} DESC
        LIMIT 1
      )`,
    })
    .from(channelProductMappings)
    .innerJoin(products, eq(channelProductMappings.productId, products.id))
    .innerJoin(channels, eq(channelProductMappings.channelId, channels.id))
    .leftJoin(
      channelProducts,
      and(
        eq(channelProductMappings.channelId, channelProducts.channelId),
        eq(channelProductMappings.externalProductId, channelProducts.externalId),
      ),
    )
    .where(
      and(
        eq(channels.userId, userId),
        eq(channels.status, "connected"),
        ne(channelProductMappings.syncStatus, "in_sync"),
      ),
    )
    .orderBy(desc(products.updatedAt), products.name, channels.name);

  const grouped = new Map<number, PendingStockSyncProduct>();

  for (const row of rows) {
    const availableQuantity = Math.max(0, row.quantityOnHand - row.reservedQuantity);
    const existing = grouped.get(row.productId);

    if (!existing) {
      grouped.set(row.productId, {
        id: row.productId,
        name: row.productName,
        sku: row.sku,
        quantityOnHand: row.quantityOnHand,
        reservedQuantity: row.reservedQuantity,
        availableQuantity,
        reorderLevel: row.reorderLevel,
        lastTransactionAt: row.lastTransactionAt,
        lastTransactionNotes: row.lastTransactionNotes,
        mappings: [],
      });
    }

    grouped.get(row.productId)!.mappings.push({
      id: row.mappingId,
      channelId: row.channelId,
      channelName: row.channelName,
      channelType: row.channelType,
      externalProductId: row.externalProductId,
      label: row.label,
      syncStatus: row.syncStatus,
      lastSyncError: row.lastSyncError,
      channelStock: row.channelStock,
    });
  }

  return Array.from(grouped.values());
}

export async function getPendingStockSyncProductCount(userId: number, tx: QueryClient = db): Promise<number> {
  const [result] = await tx
    .select({ count: sql<number>`COUNT(DISTINCT ${channelProductMappings.productId})::int` })
    .from(channelProductMappings)
    .innerJoin(channels, eq(channelProductMappings.channelId, channels.id))
    .where(
      and(
        eq(channels.userId, userId),
        eq(channels.status, "connected"),
        ne(channelProductMappings.syncStatus, "in_sync"),
      ),
    );

  return result?.count ?? 0;
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
      reservedQuantity: products.reservedQuantity,
      isActive: products.isActive,
      description: products.description,
      attributes: products.attributes,
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
    .select({
      quantityOnHand: products.quantityOnHand,
      reservedQuantity: products.reservedQuantity,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (productRows.length === 0) return null;
  // Push availableQuantity to channels (on-hand minus reserved)
  return productRows[0].quantityOnHand - productRows[0].reservedQuantity;
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
      parentId: sql<string | null>`${channelProducts.rawData}->>'parentId'`,
      productType: sql<string | null>`${channelProducts.rawData}->>'amazonProductType'`,
      channelSku: channelProducts.sku,
      rawData: channelProducts.rawData,
    })
    .from(channelProductMappings)
    .innerJoin(channels, eq(channelProductMappings.channelId, channels.id))
    .leftJoin(
      channelProducts,
      and(
        eq(channelProductMappings.channelId, channelProducts.channelId),
        eq(channelProductMappings.externalProductId, channelProducts.externalId)
      )
    )
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

// Define ChannelProductWithState if it's not already defined
type ChannelProductWithState = {
  id: string;
  name: string;
  sku: string | null;
  type: "simple" | "variable" | "variation";
  parentId: string | null;
  images: string[] | null;
  stockQuantity: number | null;
  rawPayload?: Record<string, unknown>;
  mappingState: { kind: "unmapped" } | { kind: "mapped_here" } | { kind: "mapped_other"; productId: number; productName: string };
};

export async function getExternalProducts(
  channelId: number,
  search?: string,
  limit: number = 50,
  offset: number = 0,
  tx: QueryClient = db,
): Promise<{ products: ChannelProductWithState[]; total: number }> {
  // Only fetch top-level products (Simple or Variable parents)
  // Deep Search: Match parent name OR any of its variations matching name/sku
  const where = and(
    eq(channelProducts.channelId, channelId),
    sql`${channelProducts.rawData}->>'parentId' IS NULL`,
    search
      ? sql`(
          ${channelProducts.name} ILIKE ${`%${search}%`} OR 
          ${channelProducts.sku} ILIKE ${`%${search}%`} OR
          EXISTS (
            SELECT 1 FROM ${channelProducts} AS variations 
            WHERE variations.channel_id = ${channelId} 
            AND variations.raw_data->>'parentId' = ${channelProducts.externalId}
            AND (
              variations.name ILIKE ${`%${search}%`} OR 
              variations.sku ILIKE ${`%${search}%`}
            )
          )
        )`
      : undefined,
  );

  const [countResult] = await tx
    .select({ count: count() })
    .from(channelProducts)
    .where(where);

  const results = await tx
    .select({
      id: channelProducts.externalId,
      name: channelProducts.name,
      sku: channelProducts.sku,
      type: channelProducts.type,
      stockQuantity: channelProducts.stockQuantity,
      rawPayload: channelProducts.rawData,
      parentId: sql<string | null>`${channelProducts.rawData}->>'parentId'`,
      images: sql<string[] | null>`${channelProducts.rawData}->'images'`,
      mappingState: sql<ChannelProductWithState["mappingState"]>`
        CASE 
          WHEN ${channelProductMappings.productId} = ${-1} THEN jsonb_build_object('kind', 'unmapped')
          WHEN ${channelProductMappings.productId} IS NOT NULL THEN 
            jsonb_build_object('kind', 'mapped_other', 'productName', ${products.name}, 'productId', ${products.id})
          ELSE jsonb_build_object('kind', 'unmapped')
        END
      `.mapWith(
        (val) =>
          typeof val === "string"
            ? JSON.parse(val)
            : val || { kind: "unmapped" },
      ),
    })
    .from(channelProducts)
    .leftJoin(
      channelProductMappings,
      eq(channelProducts.externalId, channelProductMappings.externalProductId),
    )
    .leftJoin(products, eq(channelProductMappings.productId, products.id))
    .where(where)
    .orderBy(channelProducts.externalId)
    .limit(limit)
    .offset(offset);

  return {
    products: results as unknown as ChannelProductWithState[],
    total: Number(countResult?.count || 0),
  };
}

export async function getVariationsForParent(
  channelId: number,
  parentId: string,
  search?: string,
  tx: QueryClient = db,
): Promise<ChannelProductWithState[]> {
  const where = and(
    eq(channelProducts.channelId, channelId),
    sql`${channelProducts.rawData}->>'parentId' = ${parentId}`,
    search
      ? sql`(
          ${channelProducts.name} ILIKE ${`%${search}%`} OR 
          ${channelProducts.sku} ILIKE ${`%${search}%`}
        )`
      : undefined,
  );
  const results = await tx
    .select({
      id: channelProducts.externalId,
      name: channelProducts.name,
      sku: channelProducts.sku,
      type: channelProducts.type,
      stockQuantity: channelProducts.stockQuantity,
      rawPayload: channelProducts.rawData,
      parentId: sql<string | null>`${channelProducts.rawData}->>'parentId'`,
      images: sql<string[] | null>`${channelProducts.rawData}->'images'`,
      mappingState: sql<ChannelProductWithState["mappingState"]>`
        CASE 
          WHEN ${channelProductMappings.productId} = ${-1} THEN jsonb_build_object('kind', 'unmapped')
          WHEN ${channelProductMappings.productId} IS NOT NULL THEN 
            jsonb_build_object('kind', 'mapped_other', 'productName', ${products.name}, 'productId', ${products.id})
          ELSE jsonb_build_object('kind', 'unmapped')
        END
      `.mapWith(
        (val) =>
          typeof val === "string"
            ? JSON.parse(val)
            : val || { kind: "unmapped" },
      ),
    })
    .from(channelProducts)
    .leftJoin(
      channelProductMappings,
      eq(channelProducts.externalId, channelProductMappings.externalProductId),
    )
    .leftJoin(products, eq(channelProductMappings.productId, products.id))
    .where(where)
    .orderBy(channelProducts.externalId);

  return results as unknown as ChannelProductWithState[];
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
