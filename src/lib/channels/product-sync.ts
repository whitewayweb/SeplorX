import { db } from "@/db";
import {
  channelProductSyncJobItems,
  channelProductSyncJobs,
  channelProducts,
  channels,
} from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getChannelHandler } from "@/lib/channels/handlers";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import { upsertChannelProducts } from "@/lib/channels/queries";
import type { ExternalProduct } from "@/lib/channels/types";
import { AmazonAPIClient } from "@/lib/channels/amazon/api/client";

const PRODUCT_SYNC_BATCH_SIZE = 3;
const ACTIVE_JOB_STATUSES = ["queued", "waiting_report", "importing", "enriching"] as const;

type ProductSyncStatus = "queued" | "waiting_report" | "importing" | "enriching" | "done" | "failed";

type ChannelProductSyncContext = {
  id: number;
  userId: number;
  channelType: string;
  storeUrl: string | null;
  credentials: Record<string, string>;
  status: string;
};

export interface ChannelProductSyncJobItemView {
  id: number;
  externalId: string;
  sku: string | null;
  status: string;
  errorMessage: string | null;
  updatedAt: Date;
}

export interface ChannelProductSyncJobView {
  id: number;
  channelId: number;
  status: string;
  phase: string;
  reportId: string | null;
  reportDocumentId: string | null;
  totalCount: number;
  importedCount: number;
  enrichedCount: number;
  failedCount: number;
  skippedCount: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  recentItems: ChannelProductSyncJobItemView[];
}

export async function startChannelProductSyncJobService(
  userId: number,
  channelId: number,
): Promise<ChannelProductSyncJobView> {
  const activeJob = await getActiveChannelProductSyncJob(userId, channelId);
  if (activeJob) return getChannelProductSyncJobStatus(userId, activeJob.id);

  const channel = await getChannelProductSyncContext(userId, channelId);
  const handler = getChannelHandler(channel.channelType);
  if (!handler?.capabilities.canFetchProducts || !handler.fetchProducts) {
    throw new Error("This channel type does not support fetching products.");
  }

  const credentials = await decryptChannelCredentials(channel.credentials);
  if (Object.keys(credentials).length === 0) {
    throw new Error("Channel credentials missing.");
  }

  const now = new Date();

  if (channel.channelType === "amazon") {
    const client = createAmazonClient(channel, credentials);
    const reportId = await client.createListingsReport();
    const [job] = await db
      .insert(channelProductSyncJobs)
      .values({
        userId,
        channelId,
        status: "waiting_report",
        phase: "waiting_report",
        reportId,
        updatedAt: now,
      })
      .returning({ id: channelProductSyncJobs.id });

    return getChannelProductSyncJobStatus(userId, job.id);
  }

  const [job] = await db
    .insert(channelProductSyncJobs)
    .values({
      userId,
      channelId,
      status: "queued",
      phase: "importing",
      updatedAt: now,
    })
    .returning({ id: channelProductSyncJobs.id });

  return getChannelProductSyncJobStatus(userId, job.id);
}

export async function processChannelProductSyncJobService(
  userId: number,
  jobId: number,
): Promise<ChannelProductSyncJobView> {
  const job = await getChannelProductSyncJobForUser(userId, jobId);
  if (!job) throw new Error("Product fetch job not found.");

  if (job.status === "done" || job.status === "failed") {
    return getChannelProductSyncJobStatus(userId, jobId);
  }

  const channel = await getChannelProductSyncContext(userId, job.channelId);
  const credentials = await decryptChannelCredentials(channel.credentials);
  if (Object.keys(credentials).length === 0) {
    await failChannelProductSyncJob(jobId, "Channel credentials missing.");
    return getChannelProductSyncJobStatus(userId, jobId);
  }

  try {
    if (channel.channelType === "amazon") {
      await processAmazonProductSyncJob(job, channel, credentials);
    } else {
      await processImmediateProductSyncJob(job, channel, credentials);
    }
  } catch (err) {
    await failChannelProductSyncJob(
      jobId,
      String(err).replace(/^Error:\s*/, "").substring(0, 300),
    );
  }

  return getChannelProductSyncJobStatus(userId, jobId);
}

export async function getChannelProductSyncJobStatus(
  userId: number,
  jobId: number,
): Promise<ChannelProductSyncJobView> {
  const [job] = await db
    .select({
      id: channelProductSyncJobs.id,
      channelId: channelProductSyncJobs.channelId,
      status: channelProductSyncJobs.status,
      phase: channelProductSyncJobs.phase,
      reportId: channelProductSyncJobs.reportId,
      reportDocumentId: channelProductSyncJobs.reportDocumentId,
      totalCount: channelProductSyncJobs.totalCount,
      importedCount: channelProductSyncJobs.importedCount,
      enrichedCount: channelProductSyncJobs.enrichedCount,
      failedCount: channelProductSyncJobs.failedCount,
      skippedCount: channelProductSyncJobs.skippedCount,
      errorMessage: channelProductSyncJobs.errorMessage,
      createdAt: channelProductSyncJobs.createdAt,
      updatedAt: channelProductSyncJobs.updatedAt,
      completedAt: channelProductSyncJobs.completedAt,
    })
    .from(channelProductSyncJobs)
    .where(and(eq(channelProductSyncJobs.id, jobId), eq(channelProductSyncJobs.userId, userId)))
    .limit(1);

  if (!job) throw new Error("Product fetch job not found.");

  const recentItems = await db
    .select({
      id: channelProductSyncJobItems.id,
      externalId: channelProductSyncJobItems.externalId,
      sku: channelProductSyncJobItems.sku,
      status: channelProductSyncJobItems.status,
      errorMessage: channelProductSyncJobItems.errorMessage,
      updatedAt: channelProductSyncJobItems.updatedAt,
    })
    .from(channelProductSyncJobItems)
    .where(eq(channelProductSyncJobItems.jobId, jobId))
    .orderBy(desc(channelProductSyncJobItems.updatedAt), desc(channelProductSyncJobItems.id))
    .limit(8);

  return { ...job, recentItems };
}

async function processAmazonProductSyncJob(
  job: { id: number; channelId: number; status: string; phase: string; reportId: string | null; reportDocumentId: string | null },
  channel: ChannelProductSyncContext,
  credentials: Record<string, string>,
) {
  const client = createAmazonClient(channel, credentials);
  let reportDocumentId = job.reportDocumentId;

  if (!reportDocumentId) {
    if (!job.reportId) {
      const reportId = await client.createListingsReport();
      await db
        .update(channelProductSyncJobs)
        .set({
          status: "waiting_report",
          phase: "waiting_report",
          reportId,
          updatedAt: new Date(),
        })
        .where(eq(channelProductSyncJobs.id, job.id));
      return;
    }

    const reportStatus = await client.getListingsReportStatus(job.reportId);
    if (reportStatus.processingStatus === "CANCELLED" || reportStatus.processingStatus === "FATAL") {
      await failChannelProductSyncJob(job.id, `Amazon report failed: ${reportStatus.processingStatus}`);
      return;
    }

    if (reportStatus.processingStatus !== "DONE" || !reportStatus.reportDocumentId) {
      await db
        .update(channelProductSyncJobs)
        .set({
          status: "waiting_report",
          phase: "waiting_report",
          updatedAt: new Date(),
        })
        .where(eq(channelProductSyncJobs.id, job.id));
      return;
    }

    reportDocumentId = reportStatus.reportDocumentId;
  }

  if (job.phase === "waiting_report" || job.phase === "importing") {
    await importAmazonReportProducts(job.id, job.channelId, client, reportDocumentId);
  }

  await enrichPendingProductSyncItems(job.id, channel, credentials);
}

async function importAmazonReportProducts(
  jobId: number,
  channelId: number,
  client: AmazonAPIClient,
  reportDocumentId: string,
) {
  await db
    .update(channelProductSyncJobs)
    .set({
      status: "importing",
      phase: "importing",
      reportDocumentId,
      updatedAt: new Date(),
    })
    .where(eq(channelProductSyncJobs.id, jobId));

  const externalProducts = await client.downloadAndParseListingsReport(reportDocumentId);
  await persistExternalProducts(channelId, externalProducts);
  await createProductSyncItems(jobId, channelId, externalProducts);

  await db
    .update(channelProductSyncJobs)
    .set({
      status: externalProducts.length > 0 ? "enriching" : "done",
      phase: externalProducts.length > 0 ? "enriching" : "done",
      totalCount: externalProducts.length,
      importedCount: externalProducts.length,
      updatedAt: new Date(),
      completedAt: externalProducts.length > 0 ? null : new Date(),
    })
    .where(eq(channelProductSyncJobs.id, jobId));
}

async function processImmediateProductSyncJob(
  job: { id: number; channelId: number },
  channel: ChannelProductSyncContext,
  credentials: Record<string, string>,
) {
  const handler = getChannelHandler(channel.channelType);
  if (!handler?.fetchProducts || !channel.storeUrl) {
    throw new Error("This channel type does not support fetching products.");
  }

  await db
    .update(channelProductSyncJobs)
    .set({ status: "importing", phase: "importing", updatedAt: new Date() })
    .where(eq(channelProductSyncJobs.id, job.id));

  const externalProducts = await handler.fetchProducts(channel.storeUrl, credentials);
  await persistExternalProducts(channel.id, externalProducts);

  await db
    .update(channelProductSyncJobs)
    .set({
      status: "done",
      phase: "done",
      totalCount: externalProducts.length,
      importedCount: externalProducts.length,
      enrichedCount: externalProducts.length,
      updatedAt: new Date(),
      completedAt: new Date(),
    })
    .where(eq(channelProductSyncJobs.id, job.id));
}

async function enrichPendingProductSyncItems(
  jobId: number,
  channel: ChannelProductSyncContext,
  credentials: Record<string, string>,
) {
  const pendingItems = await claimPendingProductSyncItems(jobId, channel.id, PRODUCT_SYNC_BATCH_SIZE);
  if (pendingItems.length === 0) {
    await refreshChannelProductSyncJobCounts(jobId);
    return;
  }

  const client = createAmazonClient(channel, credentials);
  const externalProducts = pendingItems.map((item) => ({
    id: item.externalId,
    name: item.name || item.externalId,
    sku: item.sku ?? undefined,
    stockQuantity: item.stockQuantity ?? undefined,
    type: item.type as ExternalProduct["type"],
    rawPayload: (item.rawData as Record<string, unknown>) ?? {},
  }));

  try {
    const enrichedProducts = await client.enrichProducts(externalProducts, {
      discoverVirtualParents: false,
    });
    await persistExternalProducts(channel.id, enrichedProducts);

    await db
      .update(channelProductSyncJobItems)
      .set({ status: "success", errorMessage: null, completedAt: new Date(), updatedAt: new Date() })
      .where(inArray(channelProductSyncJobItems.id, pendingItems.map((item) => item.jobItemId)));
  } catch (err) {
    const message = String(err).replace(/^Error:\s*/, "").substring(0, 300);
    await db
      .update(channelProductSyncJobItems)
      .set({ status: "failed", errorMessage: message, completedAt: new Date(), updatedAt: new Date() })
      .where(inArray(channelProductSyncJobItems.id, pendingItems.map((item) => item.jobItemId)));
  }

  await refreshChannelProductSyncJobCounts(jobId);
}

async function createProductSyncItems(
  jobId: number,
  channelId: number,
  externalProducts: ExternalProduct[],
) {
  if (externalProducts.length === 0) return;

  const externalIds = Array.from(new Set(externalProducts.map((product) => product.id)));
  const productRows = await db
    .select({
      id: channelProducts.id,
      externalId: channelProducts.externalId,
      sku: channelProducts.sku,
    })
    .from(channelProducts)
    .where(and(eq(channelProducts.channelId, channelId), inArray(channelProducts.externalId, externalIds)));

  const byExternalId = new Map(productRows.map((product) => [product.externalId, product]));
  const insertedAt = new Date();

  await db
    .insert(channelProductSyncJobItems)
    .values(
      externalIds.map((externalId) => {
        const product = byExternalId.get(externalId);
        const source = externalProducts.find((item) => item.id === externalId);
        return {
          jobId,
          channelProductId: product?.id ?? null,
          externalId,
          sku: product?.sku ?? source?.sku ?? null,
          status: "pending",
          updatedAt: insertedAt,
        };
      }),
    )
    .onConflictDoNothing({
      target: [channelProductSyncJobItems.jobId, channelProductSyncJobItems.externalId],
    });
}

async function persistExternalProducts(channelId: number, externalProducts: ExternalProduct[]) {
  if (externalProducts.length === 0) return;

  const BATCH_SIZE = 100;
  for (let i = 0; i < externalProducts.length; i += BATCH_SIZE) {
    const batch = externalProducts.slice(i, i + BATCH_SIZE).map((product) => ({
      channelId,
      externalId: product.id,
      name: product.name,
      sku: product.sku ?? null,
      stockQuantity: product.stockQuantity ?? null,
      type: product.type ?? null,
      rawData: { ...product.rawPayload, parentId: product.parentId },
    }));

    await upsertChannelProducts(batch);
  }
}

async function refreshChannelProductSyncJobCounts(jobId: number) {
  const [counts] = await db
    .select({
      totalCount: sql<number>`COUNT(*)::int`,
      enrichedCount: sql<number>`COUNT(*) FILTER (WHERE ${channelProductSyncJobItems.status} = 'success')::int`,
      failedCount: sql<number>`COUNT(*) FILTER (WHERE ${channelProductSyncJobItems.status} = 'failed')::int`,
      skippedCount: sql<number>`COUNT(*) FILTER (WHERE ${channelProductSyncJobItems.status} = 'skipped')::int`,
      pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${channelProductSyncJobItems.status} IN ('pending', 'processing'))::int`,
    })
    .from(channelProductSyncJobItems)
    .where(eq(channelProductSyncJobItems.jobId, jobId));

  const pendingCount = counts?.pendingCount ?? 0;
  await db
    .update(channelProductSyncJobs)
    .set({
      status: pendingCount > 0 ? "enriching" : "done",
      phase: pendingCount > 0 ? "enriching" : "done",
      totalCount: counts?.totalCount ?? 0,
      enrichedCount: counts?.enrichedCount ?? 0,
      failedCount: counts?.failedCount ?? 0,
      skippedCount: counts?.skippedCount ?? 0,
      updatedAt: new Date(),
      completedAt: pendingCount > 0 ? null : new Date(),
    })
    .where(eq(channelProductSyncJobs.id, jobId));
}

async function claimPendingProductSyncItems(
  jobId: number,
  channelId: number,
  limit: number,
): Promise<Array<{
  jobItemId: number;
  externalId: string;
  sku: string | null;
  name: string | null;
  stockQuantity: number | null;
  type: string | null;
  rawData: unknown;
}>> {
  const rows = await db.execute(sql`
    WITH claimed AS (
      SELECT ${channelProductSyncJobItems.id} AS job_item_id
      FROM ${channelProductSyncJobItems}
      WHERE ${channelProductSyncJobItems.jobId} = ${jobId}
        AND ${channelProductSyncJobItems.status} = 'pending'
      ORDER BY ${channelProductSyncJobItems.id}
      FOR UPDATE OF ${channelProductSyncJobItems} SKIP LOCKED
      LIMIT ${limit}
    ),
    updated AS (
      UPDATE ${channelProductSyncJobItems}
      SET status = 'processing',
          started_at = now(),
          updated_at = now()
      FROM claimed
      WHERE ${channelProductSyncJobItems.id} = claimed.job_item_id
      RETURNING
        ${channelProductSyncJobItems.id} AS job_item_id,
        ${channelProductSyncJobItems.externalId} AS external_id,
        ${channelProductSyncJobItems.sku} AS item_sku
    )
    SELECT
      updated.job_item_id AS "jobItemId",
      updated.external_id AS "externalId",
      COALESCE(${channelProducts.sku}, updated.item_sku) AS "sku",
      ${channelProducts.name} AS "name",
      ${channelProducts.stockQuantity} AS "stockQuantity",
      ${channelProducts.type} AS "type",
      ${channelProducts.rawData} AS "rawData"
    FROM updated
    INNER JOIN ${channelProducts}
      ON ${channelProducts.channelId} = ${channelId}
      AND ${channelProducts.externalId} = updated.external_id
    ORDER BY updated.job_item_id
  `);

  return rows as unknown as Array<{
    jobItemId: number;
    externalId: string;
    sku: string | null;
    name: string | null;
    stockQuantity: number | null;
    type: string | null;
    rawData: unknown;
  }>;
}

async function getChannelProductSyncContext(
  userId: number,
  channelId: number,
): Promise<ChannelProductSyncContext> {
  const [channel] = await db
    .select({
      id: channels.id,
      userId: channels.userId,
      channelType: channels.channelType,
      storeUrl: channels.storeUrl,
      credentials: channels.credentials,
      status: channels.status,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (!channel) throw new Error("Channel not found.");
  if (channel.status !== "connected") throw new Error("Channel is not connected.");
  if (!channel.storeUrl) throw new Error("Channel has no store URL.");

  return channel;
}

async function getActiveChannelProductSyncJob(userId: number, channelId: number) {
  const [job] = await db
    .select({ id: channelProductSyncJobs.id })
    .from(channelProductSyncJobs)
    .where(
      and(
        eq(channelProductSyncJobs.userId, userId),
        eq(channelProductSyncJobs.channelId, channelId),
        inArray(channelProductSyncJobs.status, [...ACTIVE_JOB_STATUSES]),
      ),
    )
    .orderBy(desc(channelProductSyncJobs.createdAt))
    .limit(1);

  return job ?? null;
}

async function getChannelProductSyncJobForUser(userId: number, jobId: number) {
  const [job] = await db
    .select({
      id: channelProductSyncJobs.id,
      channelId: channelProductSyncJobs.channelId,
      status: channelProductSyncJobs.status,
      phase: channelProductSyncJobs.phase,
      reportId: channelProductSyncJobs.reportId,
      reportDocumentId: channelProductSyncJobs.reportDocumentId,
    })
    .from(channelProductSyncJobs)
    .where(and(eq(channelProductSyncJobs.id, jobId), eq(channelProductSyncJobs.userId, userId)))
    .limit(1);

  return job ?? null;
}

async function failChannelProductSyncJob(jobId: number, message: string) {
  await db
    .update(channelProductSyncJobs)
    .set({
      status: "failed",
      phase: "failed",
      errorMessage: message,
      updatedAt: new Date(),
      completedAt: new Date(),
    })
    .where(eq(channelProductSyncJobs.id, jobId));
}

function createAmazonClient(
  channel: ChannelProductSyncContext,
  credentials: Record<string, string>,
) {
  if (
    !credentials.marketplaceId ||
    !credentials.clientId ||
    !credentials.clientSecret ||
    !credentials.refreshToken
  ) {
    throw new Error(
      "Missing required Amazon credentials (marketplaceId, clientId, clientSecret, refreshToken).",
    );
  }

  return new AmazonAPIClient(credentials, channel.storeUrl ?? "");
}

export function isChannelProductSyncRunning(status: string): status is ProductSyncStatus {
  return status === "queued" || status === "waiting_report" || status === "importing" || status === "enriching";
}
