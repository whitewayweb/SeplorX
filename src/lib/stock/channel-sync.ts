import { db } from "@/db";
import { channelProductMappings, channelProducts, channels, stockSyncJobItems, stockSyncJobs } from "@/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getChannelHandler } from "@/lib/channels/handlers";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import {
  getProductQuantity,
  getChannelMappingsForStockPush,
} from "@/data/products";

const STOCK_PUSH_TIMEOUT_MS = 30_000;
const STOCK_PUSH_POLL_BATCH_SIZE = 5;

export interface StockPushItemResult {
  mappingId: number;
  channelName: string;
  externalProductId: string;
  label: string | null;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface StockPushProductResult {
  productId: number;
  quantity: number;
  results: StockPushItemResult[];
}

export interface StockPushJobItemView {
  id: number;
  mappingId: number;
  channelId: number;
  channelName: string;
  externalProductId: string;
  label: string | null;
  status: string;
  channelStock: number | null;
  errorMessage: string | null;
  updatedAt: Date;
}

export interface StockPushJobView {
  id: number;
  productId: number;
  quantity: number;
  status: string;
  totalCount: number;
  pushedCount: number;
  failedCount: number;
  skippedCount: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  items: StockPushJobItemView[];
}

type StockPushMappingRow = Awaited<ReturnType<typeof getChannelMappingsForStockPush>>[number];

export async function pushProductStockToChannelsService(
  userId: number,
  productId: number,
): Promise<StockPushProductResult> {
  const quantity = await getProductQuantity(productId);
  if (quantity === null) throw new Error("Product not found.");

  const mappings = await getChannelMappingsForStockPush(userId, productId);
  const results: StockPushItemResult[] = [];
  const decryptedCredsCache = new Map<string, Record<string, string>>();

  for (const m of mappings) {
    results.push(await pushSingleStockMapping(quantity, m, decryptedCredsCache));
  }

  await persistStockPushResults(results);

  return { productId, quantity, results };
}

export async function createStockPushJobService(
  userId: number,
  productId: number,
): Promise<StockPushJobView> {
  const jobId = await db.transaction(async (tx) => {
    const quantity = await getProductQuantity(productId, tx);
    if (quantity === null) throw new Error("Product not found.");

    const mappings = await getChannelMappingsForStockPush(userId, productId, tx);
    if (mappings.length === 0) throw new Error("No supported channel stock mappings found for this product.");

    const now = new Date();
    const [job] = await tx
      .insert(stockSyncJobs)
      .values({
        userId,
        productId,
        quantity,
        status: "queued",
        totalCount: mappings.length,
        updatedAt: now,
      })
      .returning({ id: stockSyncJobs.id });

    const insertedItems = await tx
      .insert(stockSyncJobItems)
      .values(
        mappings.map((mapping) => ({
          jobId: job.id,
          mappingId: mapping.mappingId,
          channelId: mapping.channelId,
          channelName: mapping.channelName,
          externalProductId: mapping.externalProductId,
          label: mapping.label,
          status: "pending",
          channelStock: mapping.channelStock,
          updatedAt: now,
        })),
      )
      .returning({ id: stockSyncJobItems.id });

    if (insertedItems.length !== mappings.length) {
      throw new Error("Failed to create stock push job items.");
    }

    return job.id;
  });

  return getStockPushJobStatus(userId, jobId);
}

export async function processStockPushJobBatchService(
  userId: number,
  jobId: number,
  batchSize = STOCK_PUSH_POLL_BATCH_SIZE,
): Promise<StockPushJobView> {
  const job = await getStockPushJobForUser(userId, jobId);
  if (!job) throw new Error("Stock push job not found.");

  if (job.status === "done" || job.status === "failed") {
    return getStockPushJobStatus(userId, jobId);
  }

  await db
    .update(stockSyncJobs)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(stockSyncJobs.id, jobId));

  const pendingItems = await claimPendingJobItemsForProcessing(userId, jobId, Math.max(1, Math.min(batchSize, 20)));

  if (pendingItems.length === 0) {
    await refreshStockPushJobCounts(jobId);
    return getStockPushJobStatus(userId, jobId);
  }

  const decryptedCredsCache = new Map<string, Record<string, string>>();
  const itemResults = await Promise.all(
    pendingItems.map(async (item) => ({
      itemId: item.jobItemId,
      result: await pushSingleStockMapping(job.quantity, item, decryptedCredsCache),
    })),
  );

  for (const { itemId, result } of itemResults) {
    const status = result.ok ? "success" : result.skipped ? "skipped" : "failed";

    await db
      .update(stockSyncJobItems)
      .set({
        status,
        errorMessage: result.error ?? null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stockSyncJobItems.id, itemId));
  }

  await persistStockPushResults(itemResults.map(({ result }) => result));
  await refreshStockPushJobCounts(jobId);
  return getStockPushJobStatus(userId, jobId);
}

export async function getStockPushJobStatus(userId: number, jobId: number): Promise<StockPushJobView> {
  const [job] = await db
    .select({
      id: stockSyncJobs.id,
      productId: stockSyncJobs.productId,
      quantity: stockSyncJobs.quantity,
      status: stockSyncJobs.status,
      totalCount: stockSyncJobs.totalCount,
      pushedCount: stockSyncJobs.pushedCount,
      failedCount: stockSyncJobs.failedCount,
      skippedCount: stockSyncJobs.skippedCount,
      errorMessage: stockSyncJobs.errorMessage,
      createdAt: stockSyncJobs.createdAt,
      updatedAt: stockSyncJobs.updatedAt,
      completedAt: stockSyncJobs.completedAt,
    })
    .from(stockSyncJobs)
    .where(and(eq(stockSyncJobs.id, jobId), eq(stockSyncJobs.userId, userId)))
    .limit(1);

  if (!job) throw new Error("Stock push job not found.");

  const items = await db
    .select({
      id: stockSyncJobItems.id,
      mappingId: stockSyncJobItems.mappingId,
      channelId: stockSyncJobItems.channelId,
      channelName: stockSyncJobItems.channelName,
      externalProductId: stockSyncJobItems.externalProductId,
      label: stockSyncJobItems.label,
      status: stockSyncJobItems.status,
      channelStock: stockSyncJobItems.channelStock,
      errorMessage: stockSyncJobItems.errorMessage,
      updatedAt: stockSyncJobItems.updatedAt,
    })
    .from(stockSyncJobItems)
    .where(eq(stockSyncJobItems.jobId, jobId))
    .orderBy(asc(stockSyncJobItems.id));

  return { ...job, items };
}

async function pushSingleStockMapping(
  quantity: number,
  m: StockPushMappingRow,
  decryptedCredsCache: Map<string, Record<string, string>>,
): Promise<StockPushItemResult> {
  const handler = getChannelHandler(m.channelType);
  if (!handler || !m.storeUrl) {
    return {
      mappingId: m.mappingId,
      channelName: m.channelName,
      externalProductId: m.externalProductId,
      label: m.label,
      ok: false,
      error: "Handler or store URL not available.",
    };
  }

  try {
    const credsKey = JSON.stringify(m.credentials);
    let decryptedCreds = decryptedCredsCache.get(credsKey);
    if (!decryptedCreds) {
      decryptedCreds = await decryptChannelCredentials(m.credentials);
      decryptedCredsCache.set(credsKey, decryptedCreds);
    }

    if (Object.keys(decryptedCreds).length === 0) {
      return {
        mappingId: m.mappingId,
        channelName: m.channelName,
        externalProductId: m.externalProductId,
        label: m.label,
        ok: false,
        error: "Missing credentials.",
      };
    }

    if (!handler.capabilities.canPushStock || !handler.pushStock) {
      return {
        mappingId: m.mappingId,
        channelName: m.channelName,
        externalProductId: m.externalProductId,
        label: m.label,
        ok: false,
        skipped: true,
        error: "This channel does not support stock push.",
      };
    }

    await withTimeout(
      handler.pushStock(
        m.storeUrl,
        decryptedCreds,
        m.externalProductId,
        quantity,
        m.parentId,
        m.channelSku,
        m.productType,
        m.rawData as Record<string, unknown> | null,
      ),
      STOCK_PUSH_TIMEOUT_MS,
    );
    return {
      mappingId: m.mappingId,
      channelName: m.channelName,
      externalProductId: m.externalProductId,
      label: m.label,
      ok: true,
    };
  } catch (err) {
    const msg = String(err).replace(/^Error:\s*/, "").substring(0, 200);
    return {
      mappingId: m.mappingId,
      channelName: m.channelName,
      externalProductId: m.externalProductId,
      label: m.label,
      ok: false,
      error: msg,
    };
  }
}

async function getStockPushJobForUser(userId: number, jobId: number) {
  const [job] = await db
    .select({
      id: stockSyncJobs.id,
      productId: stockSyncJobs.productId,
      quantity: stockSyncJobs.quantity,
      status: stockSyncJobs.status,
    })
    .from(stockSyncJobs)
    .where(and(eq(stockSyncJobs.id, jobId), eq(stockSyncJobs.userId, userId)))
    .limit(1);

  return job ?? null;
}

async function claimPendingJobItemsForProcessing(
  userId: number,
  jobId: number,
  limit: number,
): Promise<(StockPushMappingRow & { jobItemId: number })[]> {
  const rows = await db.execute(sql`
    WITH claimed AS (
      SELECT ${stockSyncJobItems.id} AS job_item_id
      FROM ${stockSyncJobItems}
      INNER JOIN ${stockSyncJobs} ON ${stockSyncJobItems.jobId} = ${stockSyncJobs.id}
      INNER JOIN ${channelProductMappings} ON ${stockSyncJobItems.mappingId} = ${channelProductMappings.id}
      INNER JOIN ${channels} ON ${channelProductMappings.channelId} = ${channels.id}
      WHERE ${stockSyncJobItems.jobId} = ${jobId}
        AND ${stockSyncJobItems.status} = 'pending'
        AND ${stockSyncJobs.userId} = ${userId}
        AND ${channels.userId} = ${userId}
        AND ${channels.status} = 'connected'
      ORDER BY ${stockSyncJobItems.id}
      FOR UPDATE OF ${stockSyncJobItems} SKIP LOCKED
      LIMIT ${limit}
    ),
    updated AS (
      UPDATE ${stockSyncJobItems}
      SET status = 'processing',
          started_at = now(),
          updated_at = now()
      FROM claimed
      WHERE ${stockSyncJobItems.id} = claimed.job_item_id
      RETURNING
        ${stockSyncJobItems.id} AS job_item_id,
        ${stockSyncJobItems.mappingId} AS mapping_id
    )
    SELECT
      updated.job_item_id AS "jobItemId",
      ${channelProductMappings.id} AS "mappingId",
      ${channelProductMappings.channelId} AS "channelId",
      ${channelProductMappings.externalProductId} AS "externalProductId",
      ${channelProductMappings.label} AS "label",
      ${channels.channelType} AS "channelType",
      ${channels.storeUrl} AS "storeUrl",
      ${channels.credentials} AS "credentials",
      ${channels.name} AS "channelName",
      ${channels.status} AS "status",
      ${channelProducts.rawData}->>'parentId' AS "parentId",
      ${channelProducts.rawData}->>'amazonProductType' AS "productType",
      ${channelProducts.sku} AS "channelSku",
      ${channelProducts.stockQuantity} AS "channelStock",
      ${channelProducts.rawData} AS "rawData"
    FROM updated
    INNER JOIN ${channelProductMappings} ON updated.mapping_id = ${channelProductMappings.id}
    INNER JOIN ${channels} ON ${channelProductMappings.channelId} = ${channels.id}
    LEFT JOIN ${channelProducts}
      ON ${channelProductMappings.channelId} = ${channelProducts.channelId}
      AND ${channelProductMappings.externalProductId} = ${channelProducts.externalId}
    ORDER BY updated.job_item_id
  `);

  return rows as unknown as (StockPushMappingRow & { jobItemId: number })[];
}

async function refreshStockPushJobCounts(jobId: number) {
  const [counts] = await db
    .select({
      totalCount: sql<number>`COUNT(*)::int`,
      pushedCount: sql<number>`COUNT(*) FILTER (WHERE ${stockSyncJobItems.status} = 'success')::int`,
      failedCount: sql<number>`COUNT(*) FILTER (WHERE ${stockSyncJobItems.status} = 'failed')::int`,
      skippedCount: sql<number>`COUNT(*) FILTER (WHERE ${stockSyncJobItems.status} = 'skipped')::int`,
      pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${stockSyncJobItems.status} IN ('pending', 'processing'))::int`,
    })
    .from(stockSyncJobItems)
    .where(eq(stockSyncJobItems.jobId, jobId));

  const pendingCount = counts?.pendingCount ?? 0;
  const failedCount = counts?.failedCount ?? 0;
  const nextStatus = pendingCount > 0 ? "processing" : failedCount > 0 ? "failed" : "done";

  await db
    .update(stockSyncJobs)
    .set({
      status: nextStatus,
      totalCount: counts?.totalCount ?? 0,
      pushedCount: counts?.pushedCount ?? 0,
      failedCount,
      skippedCount: counts?.skippedCount ?? 0,
      updatedAt: new Date(),
      completedAt: pendingCount === 0 ? new Date() : null,
    })
    .where(eq(stockSyncJobs.id, jobId));
}

async function persistStockPushResults(results: StockPushItemResult[]) {
  const successIds = results.filter((r) => r.ok).map((r) => r.mappingId);
  const failed = results.filter((r) => !r.ok && !r.skipped);

  if (successIds.length > 0) {
    await db
      .update(channelProductMappings)
      .set({ syncStatus: "in_sync", lastSyncError: null })
      .where(inArray(channelProductMappings.id, successIds));
  }

  for (const failure of failed) {
    await db
      .update(channelProductMappings)
      .set({
        syncStatus: "failed",
        lastSyncError: failure.error ?? "Failed to push stock.",
      })
      .where(eq(channelProductMappings.id, failure.mappingId));
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs / 1000}s.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
