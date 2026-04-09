import { db } from "@/db";
import { channels, channelProductMappings, channelProductChangelog, channelProducts, channelFeeds } from "@/db/schema";
import { and, countDistinct, desc, eq, sql } from "drizzle-orm";

export async function getConnectedChannels(userId: number) {
  return await db
    .select({ id: channels.id, channelType: channels.channelType, name: channels.name })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.status, "connected")));
}

export async function getChannelsListWithWebhooks(userId: number) {
  return await db
    .select({
      id: channels.id,
      channelType: channels.channelType,
      name: channels.name,
      status: channels.status,
      storeUrl: channels.storeUrl,
      defaultPickupLocation: channels.defaultPickupLocation,
      createdAt: channels.createdAt,
      hasWebhooks: sql<boolean>`coalesce((${channels.credentials}->>'webhookSecret'), '') != ''`.as("hasWebhooks"),
    })
    .from(channels)
    .where(eq(channels.userId, userId))
    .orderBy(channels.createdAt);
}

export async function getMappedProductsCountPerChannel(userId: number) {
  return await db
    .select({
      channelId: channelProductMappings.channelId,
      count: countDistinct(channelProductMappings.productId),
    })
    .from(channelProductMappings)
    .innerJoin(channels, eq(channelProductMappings.channelId, channels.id))
    .where(eq(channels.userId, userId))
    .groupBy(channelProductMappings.channelId);
}

export async function getChannelSyncStatusCounts(channelId: number) {
  return await db
    .select({
      syncStatus: channelProductMappings.syncStatus,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(channelProductMappings)
    .where(eq(channelProductMappings.channelId, channelId))
    .groupBy(channelProductMappings.syncStatus);
}

export async function getChannelStagedChanges(channelId: number) {
  return await db
    .select({
      id: channelProductChangelog.id,
      externalProductId: channelProductChangelog.externalProductId,
      delta: channelProductChangelog.delta,
      createdAt: channelProductChangelog.createdAt,
      productName: channelProducts.name,
    })
    .from(channelProductChangelog)
    .leftJoin(
      channelProducts,
      eq(channelProductChangelog.channelProductId, channelProducts.id),
    )
    .where(
      and(
        eq(channelProductChangelog.channelId, channelId),
        eq(channelProductChangelog.status, "staged"),
      ),
    )
    .orderBy(desc(channelProductChangelog.createdAt));
}

export async function getChannelFeedsList(channelId: number) {
  return await db
    .select({
      id: channelFeeds.id,
      feedId: channelFeeds.feedId,
      feedType: channelFeeds.feedType,
      category: channelFeeds.category,
      status: channelFeeds.status,
      productCount: channelFeeds.productCount,
      errorCount: channelFeeds.errorCount,
      uploadUrl: channelFeeds.uploadUrl,
      resultDocumentUrl: channelFeeds.resultDocumentUrl,
      errorMessage: channelFeeds.errorMessage,
      createdAt: channelFeeds.createdAt,
      updatedAt: channelFeeds.updatedAt,
    })
    .from(channelFeeds)
    .where(eq(channelFeeds.channelId, channelId))
    .orderBy(desc(channelFeeds.createdAt))
    .limit(50);
}

export async function getTotalUnmappedProductsCount(userId: number): Promise<number> {
  const result = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(channelProducts)
    .innerJoin(channels, eq(channelProducts.channelId, channels.id))
    .where(
      and(
        eq(channels.userId, userId),
        eq(channels.status, "connected"),
        sql`NOT EXISTS (
          SELECT 1 FROM ${channelProductMappings} m 
          WHERE m.channel_id = ${channelProducts.channelId} 
          AND m.external_product_id = ${channelProducts.externalId}
        )`
      )
    );

  return result[0]?.count ?? 0;
}

export async function getUnmappedChannelProducts(userId: number, limit: number = 10) {
  return await db
    .select({
      id: channelProducts.id,
      name: channelProducts.name,
      externalId: channelProducts.externalId,
      channelId: channelProducts.channelId,
      channelName: channels.name,
      lastSyncedAt: channelProducts.lastSyncedAt,
    })
    .from(channelProducts)
    .innerJoin(channels, eq(channelProducts.channelId, channels.id))
    .where(
      and(
        eq(channels.userId, userId),
        eq(channels.status, "connected"),
        sql`NOT EXISTS (
          SELECT 1 FROM ${channelProductMappings} m 
          WHERE m.channel_id = ${channelProducts.channelId} 
          AND m.external_product_id = ${channelProducts.externalId}
        )`
      )
    )
    .orderBy(desc(channelProducts.id))
    .limit(limit);
}
