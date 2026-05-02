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
  productBundles,
} from "@/db/schema";
import { and, desc, eq, inArray, ne, sql, count } from "drizzle-orm";
import { channelRegistry } from "@/lib/channels/registry";

const STOCK_PUSH_SUPPORTED_CHANNEL_TYPES = channelRegistry
  .filter((channel) => channel.capabilities?.canPushStock)
  .map((channel) => channel.id);

export type StockSyncQueueStatusFilter = "all" | "ready" | "review" | "failed";

export interface PendingStockSyncProductSummaryQuery {
  search?: string;
  status?: StockSyncQueueStatusFilter;
  channelName?: string;
  limit?: number;
  offset?: number;
}

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
      isBundle: products.isBundle,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!result[0]) return result[0];

  const product = result[0];

  if (product.isBundle) {
    const components = await tx
      .select({
        componentProductId: productBundles.componentProductId,
        quantity: productBundles.quantity,
      })
      .from(productBundles)
      .where(eq(productBundles.bundleProductId, productId))
      .orderBy(productBundles.sortOrder);
      
    return { ...product, components };
  }

  return { ...product, components: [] };
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

export interface PendingStockSyncProductSummary {
  id: number;
  name: string;
  sku: string | null;
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number;
  reorderLevel: number;
  lastTransactionAt: Date | null;
  lastTransactionNotes: string | null;
  mappingCount: number;
  pendingCount: number;
  failedCount: number;
  unknownStockCount: number;
  mismatchCount: number;
  channelStockMin: number | null;
  channelStockMax: number | null;
  channelNames: string[];
}

interface PendingStockSyncProductSummaryRow {
  productId: number;
  productName: string;
  sku: string | null;
  quantityOnHand: number;
  reservedQuantity: number;
  reorderLevel: number;
  mappingCount: number;
  pendingCount: number;
  failedCount: number;
  unknownStockCount: number;
  mismatchCount: number;
  channelStockMin: number | null;
  channelStockMax: number | null;
  channelNames: string[] | null;
  lastTransactionAt: Date | null;
  lastTransactionNotes: string | null;
  totalCount: number;
  availableQuantity: number;
}

export interface PendingStockSyncProductSummaryResult {
  products: PendingStockSyncProductSummary[];
  totalCount: number;
}

export async function getPendingStockSyncProductSummaries(
  userId: number,
  query: PendingStockSyncProductSummaryQuery = {},
  tx: QueryClient = db,
): Promise<PendingStockSyncProductSummaryResult> {
  if (STOCK_PUSH_SUPPORTED_CHANNEL_TYPES.length === 0) {
    return { products: [], totalCount: 0 };
  }

  const limit = Math.max(1, Math.min(query.limit ?? 25, 500));
  const offset = Math.max(0, query.offset ?? 0);
  const search = query.search?.trim();
  const status = query.status ?? "all";
  const channelName = query.channelName && query.channelName !== "all" ? query.channelName : null;
  const supportedChannelTypes = sql.join(
    STOCK_PUSH_SUPPORTED_CHANNEL_TYPES.map((channelType) => sql`${channelType}`),
    sql`, `,
  );
  const filters = [
    search
      ? sql`(
          "productName" ILIKE ${`%${search}%`}
          OR COALESCE("sku", '') ILIKE ${`%${search}%`}
          OR array_to_string("channelNames", ' ') ILIKE ${`%${search}%`}
        )`
      : undefined,
    channelName ? sql`${channelName} = ANY("channelNames")` : undefined,
    status === "failed"
      ? sql`"failedCount" > 0`
      : status === "review"
        ? sql`"failedCount" = 0 AND ("mismatchCount" > 0 OR "unknownStockCount" > 0)`
        : status === "ready"
          ? sql`"failedCount" = 0 AND "mismatchCount" = 0 AND "unknownStockCount" = 0`
          : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => !!filter);
  const filterSql = filters.length > 0 ? sql`WHERE ${sql.join(filters, sql` AND `)}` : sql``;

  const rows = await tx.execute(sql`
    WITH bundle_stocks AS (
      SELECT
        pb.bundle_product_id AS "productId",
        MIN(FLOOR(GREATEST(0, p.quantity_on_hand - p.reserved_quantity) / pb.quantity)) AS "bundleAvailable"
      FROM product_bundles pb
      JOIN products p ON p.id = pb.component_product_id
      GROUP BY pb.bundle_product_id
    ),
    product_stocks AS (
      SELECT
        p.id,
        CASE
          WHEN p.is_bundle THEN COALESCE(bs."bundleAvailable", 0)
          ELSE GREATEST(0, p.quantity_on_hand - p.reserved_quantity)
        END AS "availableQuantity"
      FROM products p
      LEFT JOIN bundle_stocks bs ON bs."productId" = p.id
    ),
    summaries AS (
      SELECT
        ${products.id} AS "productId",
        ${products.name} AS "productName",
        ${products.sku} AS "sku",
        ${products.quantityOnHand} AS "quantityOnHand",
        ${products.reservedQuantity} AS "reservedQuantity",
        ps."availableQuantity" AS "availableQuantity",
        ${products.reorderLevel} AS "reorderLevel",
        ${products.updatedAt} AS "productUpdatedAt",
        COUNT(${channelProductMappings.id})::int AS "mappingCount",
        COUNT(${channelProductMappings.id}) FILTER (
          WHERE ${channelProductMappings.syncStatus} = 'pending_update'
        )::int AS "pendingCount",
        COUNT(${channelProductMappings.id}) FILTER (
          WHERE ${channelProductMappings.syncStatus} = 'failed'
        )::int AS "failedCount",
        COUNT(${channelProductMappings.id}) FILTER (
          WHERE ${channelProducts.stockQuantity} IS NULL
        )::int AS "unknownStockCount",
        COUNT(${channelProductMappings.id}) FILTER (
          WHERE ${channelProducts.stockQuantity} IS NOT NULL
          AND ${channelProducts.stockQuantity} != ps."availableQuantity"
        )::int AS "mismatchCount",
        MIN(${channelProducts.stockQuantity}) AS "channelStockMin",
        MAX(${channelProducts.stockQuantity}) AS "channelStockMax",
        COALESCE(array_agg(DISTINCT ${channels.name} ORDER BY ${channels.name}), ARRAY[]::text[]) AS "channelNames",
        (
          SELECT ${inventoryTransactions.createdAt}
          FROM ${inventoryTransactions}
          WHERE ${inventoryTransactions.productId} = ${products.id}
          ORDER BY ${inventoryTransactions.createdAt} DESC
          LIMIT 1
        ) AS "lastTransactionAt",
        (
          SELECT ${inventoryTransactions.notes}
          FROM ${inventoryTransactions}
          WHERE ${inventoryTransactions.productId} = ${products.id}
          ORDER BY ${inventoryTransactions.createdAt} DESC
          LIMIT 1
        ) AS "lastTransactionNotes"
      FROM ${channelProductMappings}
      INNER JOIN ${products} ON ${channelProductMappings.productId} = ${products.id}
      INNER JOIN product_stocks ps ON ps.id = ${products.id}
      INNER JOIN ${channels} ON ${channelProductMappings.channelId} = ${channels.id}
      LEFT JOIN ${channelProducts}
        ON ${channelProductMappings.channelId} = ${channelProducts.channelId}
        AND ${channelProductMappings.externalProductId} = ${channelProducts.externalId}
      WHERE ${channels.userId} = ${userId}
        AND ${channels.status} = 'connected'
        AND ${channels.channelType} IN (${supportedChannelTypes})
        AND ${channelProductMappings.syncStatus} != 'in_sync'
      GROUP BY
        ${products.id},
        ${products.name},
        ${products.sku},
        ${products.quantityOnHand},
        ${products.reservedQuantity},
        ps."availableQuantity",
        ${products.reorderLevel},
        ${products.updatedAt}
    ),
    filtered AS (
      SELECT *
      FROM summaries
      ${filterSql}
    )
    SELECT *, COUNT(*) OVER()::int AS "totalCount"
    FROM filtered
    ORDER BY "failedCount" DESC, "mismatchCount" DESC, "pendingCount" DESC, "productUpdatedAt" DESC, "productName" ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `) as unknown as PendingStockSyncProductSummaryRow[];

  return {
    products: rows.map((row) => ({
      id: row.productId,
      name: row.productName,
      sku: row.sku,
      quantityOnHand: row.quantityOnHand,
      reservedQuantity: row.reservedQuantity,
      availableQuantity: row.availableQuantity,
      reorderLevel: row.reorderLevel,
      lastTransactionAt: row.lastTransactionAt,
      lastTransactionNotes: row.lastTransactionNotes,
      mappingCount: row.mappingCount,
      pendingCount: row.pendingCount,
      failedCount: row.failedCount,
      unknownStockCount: row.unknownStockCount,
      mismatchCount: row.mismatchCount,
      channelStockMin: row.channelStockMin,
      channelStockMax: row.channelStockMax,
      channelNames: row.channelNames ?? [],
    })),
    totalCount: rows[0]?.totalCount ?? 0,
  };
}

export async function getPendingStockSyncProductDetails(userId: number, productId: number, tx: QueryClient = db): Promise<PendingStockSyncProduct | null> {
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
        inArray(channels.channelType, STOCK_PUSH_SUPPORTED_CHANNEL_TYPES),
        eq(channelProductMappings.productId, productId),
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

  return Array.from(grouped.values())[0] ?? null;
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
        inArray(channels.channelType, STOCK_PUSH_SUPPORTED_CHANNEL_TYPES),
        ne(channelProductMappings.syncStatus, "in_sync"),
      ),
    );

  return result?.count ?? 0;
}

export async function getStockSyncQueueChannelOptions(userId: number, tx: QueryClient = db): Promise<string[]> {
  if (STOCK_PUSH_SUPPORTED_CHANNEL_TYPES.length === 0) return [];

  const rows = await tx
    .select({ channelName: channels.name })
    .from(channelProductMappings)
    .innerJoin(channels, eq(channelProductMappings.channelId, channels.id))
    .where(
      and(
        eq(channels.userId, userId),
        eq(channels.status, "connected"),
        inArray(channels.channelType, STOCK_PUSH_SUPPORTED_CHANNEL_TYPES),
        ne(channelProductMappings.syncStatus, "in_sync"),
      ),
    )
    .groupBy(channels.name)
    .orderBy(channels.name);

  return rows.map((row) => row.channelName);
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
  const allProducts = await tx
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
      isBundle: products.isBundle,
      description: products.description,
      attributes: products.attributes,
    })
    .from(products)
    .orderBy(desc(products.createdAt));

  // For bundles, calculate available quantity dynamically based on components
  const bundleProductsInList = allProducts.filter(p => p.isBundle);
  if (bundleProductsInList.length > 0) {
    const bundleIds = bundleProductsInList.map(b => b.id);
    const allComponents = await tx
      .select({
        bundleId: productBundles.bundleProductId,
        componentId: productBundles.componentProductId,
        bundleQty: productBundles.quantity,
        compQtyOnHand: products.quantityOnHand,
        compReservedQty: products.reservedQuantity,
      })
      .from(productBundles)
      .innerJoin(products, eq(productBundles.componentProductId, products.id))
      .where(inArray(productBundles.bundleProductId, bundleIds));

    const bundleMap = new Map<number, { bundleQty: number; available: number }[]>();
    allComponents.forEach(c => {
      const existing = bundleMap.get(c.bundleId) || [];
      const available = Math.max(0, (c.compQtyOnHand ?? 0) - (c.compReservedQty ?? 0));
      bundleMap.set(c.bundleId, [...existing, { bundleQty: c.bundleQty, available }]);
    });

    return allProducts.map(p => {
      if (!p.isBundle) return p;
      const comps = bundleMap.get(p.id) || [];
      if (comps.length === 0) return { ...p, quantityOnHand: 0 };

      let minAvailable = Infinity;
      comps.forEach(c => {
        const bundlePossible = Math.floor(c.available / c.bundleQty);
        if (bundlePossible < minAvailable) minAvailable = bundlePossible;
      });

      return {
        ...p,
        quantityOnHand: minAvailable === Infinity ? 0 : minAvailable,
      };
    });
  }

  return allProducts;
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

export async function getProductQuantity(
  productId: number,
  tx: QueryClient = db,
  visited = new Set<number>()
): Promise<number | null> {
  if (visited.has(productId)) {
    console.warn(`[getProductQuantity] Cycle detected for product ${productId}. Returning 0.`);
    return 0;
  }
  visited.add(productId);

  const productRows = await tx
    .select({
      quantityOnHand: products.quantityOnHand,
      reservedQuantity: products.reservedQuantity,
      isBundle: products.isBundle,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (productRows.length === 0) return null;

  const product = productRows[0];

  if (product.isBundle) {
    // Optimization: Compute bundle availability using a single query if we assume no nested bundles.
    // If nested bundles were allowed, we would need a recursive CTE or recursive calls with visited set.
    // Given we enforce no nested bundles in actions, a single join is efficient.
    const results = await tx.execute(sql`
      SELECT MIN(FLOOR(GREATEST(0, p.quantity_on_hand - p.reserved_quantity) / NULLIF(pb.quantity, 0))) AS "available"
      FROM ${productBundles} pb
      JOIN ${products} p ON p.id = pb.component_product_id
      WHERE pb.bundle_product_id = ${productId}
    `);

    const available = (results[0] as any)?.available;
    return available != null ? Number(available) : 0;
  }

  // Push availableQuantity to channels (on-hand minus reserved)
  return Math.max(0, product.quantityOnHand - product.reservedQuantity);
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
      channelStock: channelProducts.stockQuantity,
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
        inArray(channels.channelType, STOCK_PUSH_SUPPORTED_CHANNEL_TYPES),
        ne(channelProductMappings.syncStatus, "in_sync"),
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
