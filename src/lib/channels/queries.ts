import { db } from "@/db";
import { channelProducts, channels } from "@/db/schema";
import { and, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getChannelById } from "./registry";
import { decryptChannelCredentials } from "./utils";
import { ChannelType } from "./types";

/**
 * Data Access Layer (DAL) for channels.
 * Extracts database queries from UI components (Server Components) 
 * to ensure a clean separation of concerns and reusability.
 */

export async function getUserChannels(userId: number) {
  return await db
    .select({
      id: channels.id,
      name: channels.name,
    })
    .from(channels)
    .where(eq(channels.userId, userId));
}

export async function getChannel(id: number) {
  const [channel] = await db
    .select({
      id: channels.id,
      name: channels.name,
      channelType: channels.channelType,
      status: channels.status,
      credentials: channels.credentials,
      storeUrl: channels.storeUrl,
    })
    .from(channels)
    .where(eq(channels.id, id))
    .limit(1);

  return channel;
}

// A robust JSONB expression that extracts the brand name from a channel product.
// 1. Tries Amazon nested summaries ('summaries[0].brand' from catalog-item API)
// 2. Tries WooCommerce attributes array (where attribute name is 'brand')
const brandExpr = sql<string>`COALESCE(
  NULLIF(${channelProducts.rawData}->'summaries'->0->>'brand', ''),
  NULLIF(jsonb_path_query_first(
    CASE 
      WHEN jsonb_typeof(${channelProducts.rawData}->'attributes') = 'array' 
      THEN ${channelProducts.rawData}->'attributes' 
      ELSE '[]'::jsonb 
    END,
    '$[*] ? (@.name == "brand" || @.name == "Brand").option'
  )#>>'{}', '')
)`;

export async function getChannelProductsWithVariations(channelId: number, options: {
  query?: string;
  brand?: string;
  limit: number;
  offset: number;
}) {
  const { query, brand, limit, offset } = options;

  const channel = await getChannel(channelId);
  if (!channel) throw new Error("Channel not found");

  const baseCondition = and(
    eq(channelProducts.channelId, channelId),
    or(ne(channelProducts.type, "variation"), isNull(channelProducts.type))
  );

  const queryCondition = query
    ? or(
      ilike(channelProducts.name, `%${query}%`),
      ilike(channelProducts.sku, `%${query}%`),
      ilike(channelProducts.externalId, `%${query}%`),
      // Also match if any of its child variations contain the search term
      sql`EXISTS (
          SELECT 1 FROM ${channelProducts} child
          WHERE COALESCE(child.raw_data->>'parentId', CAST(child.raw_data->>'parent_id' AS TEXT)) = ${channelProducts.externalId}
          AND child.channel_id = ${channelId}
          AND (
            child.name ILIKE ${`%${query}%`} OR
            child.sku ILIKE ${`%${query}%`} OR
            child.external_id ILIKE ${`%${query}%`}
          )
        )`
    )
    : undefined;

  const brandCondition = brand
    ? sql`${brandExpr} = ${brand}`
    : undefined;

  const whereCondition = and(baseCondition, queryCondition, brandCondition);

  // 1. Get total count for pagination
  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(channelProducts)
    .where(whereCondition);

  // 2. Get the paginated parent products
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const safeOffset = Math.max(0, offset);

  const productsList = await db
    .select({
      id: channelProducts.id,
      externalId: channelProducts.externalId,
      name: channelProducts.name,
      sku: channelProducts.sku,
      type: channelProducts.type,
      stockQuantity: channelProducts.stockQuantity,
      lastSyncedAt: channelProducts.lastSyncedAt,
      rawData: channelProducts.rawData,
    })
    .from(channelProducts)
    .where(whereCondition)
    .orderBy(desc(channelProducts.lastSyncedAt))
    .limit(safeLimit)
    .offset(safeOffset);

  // 3. Get variations for these parents
  let variationsList: (typeof productsList[0] & { parentId?: string })[] = [];

  if (productsList.length > 0) {
    const parentIds = productsList.map((p) => p.externalId);
    const parentIdsSqlArr = parentIds.map((id) => sql`${id}`);
    const parentIdsSql = sql.join(parentIdsSqlArr, sql`, `);

    variationsList = await db
      .select({
        id: channelProducts.id,
        externalId: channelProducts.externalId,
        name: channelProducts.name,
        sku: channelProducts.sku,
        type: channelProducts.type,
        stockQuantity: channelProducts.stockQuantity,
        lastSyncedAt: channelProducts.lastSyncedAt,
        rawData: channelProducts.rawData,
        parentId: sql<string>`COALESCE(raw_data->>'parentId', CAST(raw_data->>'parent_id' AS TEXT))`,
      })
      .from(channelProducts)
      .where(
        and(
          eq(channelProducts.channelId, channelId),
          eq(channelProducts.type, "variation"),
          sql`COALESCE(raw_data->>'parentId', CAST(raw_data->>'parent_id' AS TEXT)) IN (${parentIdsSql})`
        )
      )
      .orderBy(desc(channelProducts.lastSyncedAt));
  }

  // 4. Inject product URLs using the registry
  const definition = getChannelById(channel.channelType as ChannelType);
  const getProductUrl = definition?.getProductUrl;
  const credentials = decryptChannelCredentials(channel.credentials);

  const productsWithUrl = productsList.map((p) => ({
    ...p,
    productUrl: getProductUrl?.(p.externalId, credentials, p.rawData),
  }));

  const variationsWithUrl = variationsList.map((v) => ({
    ...v,
    productUrl: getProductUrl?.(v.externalId, credentials, v.rawData),
  }));

  return {
    products: productsWithUrl,
    variations: variationsWithUrl,
    totalCount: count,
  };
}

/**
 * Returns a sorted list of distinct, non-empty brand names for the given channel.
 */
export async function getBrandsForChannel(channelId: number): Promise<string[]> {
  const sq = db
    .select({
      brand: brandExpr.as("brand"),
    })
    .from(channelProducts)
    .where(
      and(
        eq(channelProducts.channelId, channelId),
        // Only parent / standalone products
        or(ne(channelProducts.type, "variation"), isNull(channelProducts.type))
      )
    )
    .as("brands_subquery");

  const rows = await db
    .selectDistinct({ brand: sq.brand })
    .from(sq)
    .where(sql`${sq.brand} IS NOT NULL AND ${sq.brand} != ''`)
    .orderBy(sql`${sq.brand} ASC`);

  return rows.map((r) => r.brand).filter(Boolean);
}

export async function upsertChannelProducts(products: {
  channelId: number;
  externalId: string;
  name: string;
  sku: string | null;
  stockQuantity: number | null;
  type: string | null;
  rawData: unknown;
}[]) {
  if (products.length === 0) return;

  return await db
    .insert(channelProducts)
    .values(products.map(p => ({
      ...p,
      lastSyncedAt: new Date(),
    })))
    .onConflictDoUpdate({
      target: [channelProducts.channelId, channelProducts.externalId],
      set: {
        name: sql`COALESCE(NULLIF(EXCLUDED.name, ''), ${channelProducts.name})`,
        sku: sql`COALESCE(NULLIF(EXCLUDED.sku, ''), ${channelProducts.sku})`,
        stockQuantity: sql`COALESCE(EXCLUDED.stock_quantity, ${channelProducts.stockQuantity})`,
        type: sql`COALESCE(NULLIF(EXCLUDED.type, ''), ${channelProducts.type})`,
        rawData: sql`COALESCE(${channelProducts.rawData}, '{}'::jsonb) || EXCLUDED.raw_data`,
        lastSyncedAt: sql`EXCLUDED.last_synced_at`,
      },
    });
}

export async function upsertProductWithVariationsTx(
  product: {
    channelId: number;
    externalId: string;
    name: string;
    sku: string | null;
    stockQuantity: number | null;
    type: string | null;
    rawData: unknown;
  },
  childAsins: string[]
) {
  await db.transaction(async (tx) => {
    await tx
      .insert(channelProducts)
      .values({ ...product, lastSyncedAt: new Date() })
      .onConflictDoUpdate({
        target: [channelProducts.channelId, channelProducts.externalId],
        set: {
          name: sql`COALESCE(NULLIF(EXCLUDED.name, ''), ${channelProducts.name})`,
          sku: sql`COALESCE(NULLIF(EXCLUDED.sku, ''), ${channelProducts.sku})`,
          stockQuantity: sql`COALESCE(EXCLUDED.stock_quantity, ${channelProducts.stockQuantity})`,
          type: sql`COALESCE(NULLIF(EXCLUDED.type, ''), ${channelProducts.type})`,
          rawData: sql`COALESCE(${channelProducts.rawData}, '{}'::jsonb) || EXCLUDED.raw_data`,
          lastSyncedAt: sql`EXCLUDED.last_synced_at`,
        },
      });

    if (childAsins.length > 0) {
      await tx
        .update(channelProducts)
        .set({
          type: "variation",
          rawData: sql`${channelProducts.rawData} || jsonb_build_object('parentId', ${product.externalId}::text)`,
          lastSyncedAt: new Date(),
        })
        .where(
          and(
            eq(channelProducts.channelId, product.channelId),
            inArray(channelProducts.externalId, childAsins)
          )
        );
    }
  });
}
/**
 * Returns a Map of channelId → number of cached products.
 * Used by the Channels page to gate the "Auto-Map" button on channels
 * that have actually been synced.
 */
export async function getCachedProductCountsByChannel(): Promise<Map<number, number>> {
  const rows = await db
    .select({
      channelId: channelProducts.channelId,
      count: count(),
    })
    .from(channelProducts)
    .groupBy(channelProducts.channelId);

  return new Map(rows.map((r) => [r.channelId, r.count]));
}

/**
 * Fetches the minimal channel fields needed to validate an agent request.
 * Returns `undefined` if the channel does not exist.
 */
export async function getChannelForAgent(
  channelId: number
): Promise<{ channelType: string; status: string } | undefined> {
  const [row] = await db
    .select({
      channelType: channels.channelType,
      status: channels.status,
    })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);

  return row;
}

/**
 * Fetches a single channel product by its DB id, scoped to the current user.
 * Used by the product detail drawer.
 */
export async function getChannelProductByIdForUser(userId: number, id: number) {
  const [row] = await db
    .select({
      id: channelProducts.id,
      channelId: channelProducts.channelId,
      externalId: channelProducts.externalId,
      name: channelProducts.name,
      sku: channelProducts.sku,
      type: channelProducts.type,
      stockQuantity: channelProducts.stockQuantity,
      rawData: channelProducts.rawData,
      lastSyncedAt: channelProducts.lastSyncedAt,
      channelType: channels.channelType,
      credentials: channels.credentials,
    })
    .from(channelProducts)
    .innerJoin(channels, eq(channelProducts.channelId, channels.id))
    .where(and(eq(channelProducts.id, id), eq(channels.userId, userId)))
    .limit(1);

  if (!row) return null;

  const definition = getChannelById(row.channelType as ChannelType);
  const credentials = decryptChannelCredentials(row.credentials);

  return {
    ...row,
    productUrl: definition?.getProductUrl?.(row.externalId, credentials, row.rawData) ?? null
  };
}
