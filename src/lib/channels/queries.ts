import { db } from "@/db";
import { channelProducts, channels } from "@/db/schema";
import { and, count, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";

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
    })
    .from(channels)
    .where(eq(channels.id, id))
    .limit(1);

  return channel;
}

export async function getChannelProductsWithVariations(channelId: number, options: {
  query?: string;
  limit: number;
  offset: number;
}) {
  const { query, limit, offset } = options;

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

  const whereCondition = and(baseCondition, queryCondition);

  // 1. Get total count for pagination
  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(channelProducts)
    .where(whereCondition);

  // 2. Get the paginated parent products
  // Defense-in-depth: clamp limit and offset so this function is safe
  // regardless of what its callers pass in.
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

  return {
    products: productsList,
    variations: variationsList,
    totalCount: count,
  };
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
        name: sql`EXCLUDED.name`,
        sku: sql`EXCLUDED.sku`,
        stockQuantity: sql`EXCLUDED.stock_quantity`,
        type: sql`EXCLUDED.type`,
        rawData: sql`EXCLUDED.raw_data`,
        lastSyncedAt: sql`EXCLUDED.last_synced_at`,
      },
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
 * Fetches a single channel product by its DB id, including the full rawData payload.
 * Used by the product detail drawer.
 */
export async function getChannelProductById(id: number) {
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
    })
    .from(channelProducts)
    .where(eq(channelProducts.id, id))
    .limit(1);

  return row ?? null;
}
