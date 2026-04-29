import { db } from "@/db";
import {
  channelProductSyncJobItems,
  channelProductSyncJobs,
  channels,
} from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getChannelHandler } from "@/lib/channels/handlers";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import { upsertChannelProducts } from "@/lib/channels/queries";
import type { ExternalProduct } from "@/lib/channels/types";
import { AmazonAPIClient } from "@/lib/channels/amazon/api/client";

const ACTIVE_JOB_STATUSES = ["queued", "waiting_report", "importing", "enriching"] as const;

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
  job: {
    id: number;
    channelId: number;
    status: string;
    phase: string;
    reportId: string | null;
    reportDocumentId: string | null;
    importedCount: number;
  },
  channel: ChannelProductSyncContext,
  credentials: Record<string, string>,
) {
  if (job.phase === "enriching" || job.status === "enriching") {
    await completeAmazonProductImportJob(job.id, job.importedCount);
    return;
  }

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
    .where(eq(channelProductSyncJobs.id, jobId));
}

async function completeAmazonProductImportJob(jobId: number, importedCount: number) {
  await db
    .update(channelProductSyncJobs)
    .set({
      status: "done",
      phase: "done",
      totalCount: importedCount,
      enrichedCount: importedCount,
      updatedAt: new Date(),
      completedAt: new Date(),
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
      importedCount: channelProductSyncJobs.importedCount,
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
