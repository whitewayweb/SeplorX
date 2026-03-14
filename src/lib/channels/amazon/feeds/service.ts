import { db } from "@/db";
import { channelProductMappings, channelFeeds, channels, products, channelProducts } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { AmazonAPIClient } from "../api/client";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import { generateCategoryTemplate, type TemplateProductRow } from "./generator";
import { getTemplateForProductType, type CategoryTemplateEntry } from "./template-registry";

// ────────────────────────────────────────────────────────────────────────────
// Amazon Feeds Service
// ────────────────────────────────────────────────────────────────────────────
// Orchestrates the end-to-end flow:
//   1. Query pending_update mappings for the channel
//   2. Group by product category
//   3. For each category, generate a populated .xlsm from the tested template
//   4. Upload via SP-API Feeds API (create doc → upload → create feed)
//   5. Record feed in channel_feeds table
//   6. Update mapping sync statuses
// ────────────────────────────────────────────────────────────────────────────

const XLSM_CONTENT_TYPE = "application/vnd.ms-excel.sheet.macroEnabled.12";

export interface FeedSubmissionResult {
  category: string;
  feedId: string;
  feedDocumentId: string;
  uploadUrl: string;
  productCount: number;
}

/**
 * Submit pending product updates for an Amazon channel.
 * Groups by category, generates .xlsm files, and uploads via Feeds API.
 */
export async function submitPendingUpdates(
  userId: number,
  channelId: number,
): Promise<FeedSubmissionResult[]> {
  // ── Validate channel ownership + credentials ────────────────────────────
  const channelRows = await db
    .select({
      id: channels.id,
      channelType: channels.channelType,
      storeUrl: channels.storeUrl,
      credentials: channels.credentials,
      status: channels.status,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (channelRows.length === 0) throw new Error("Channel not found.");

  const channel = channelRows[0];
  if (channel.channelType !== "amazon") throw new Error("Feed uploads are only supported for Amazon channels.");
  if (channel.status !== "connected") throw new Error("Channel is not connected.");
  if (!channel.storeUrl) throw new Error("Channel has no store URL.");

  const decryptedCreds = decryptChannelCredentials(channel.credentials);
  if (Object.keys(decryptedCreds).length === 0) throw new Error("Channel credentials missing.");

  // ── Fetch all pending_update mappings with product data ─────────────────
  const pendingMappings = await db
    .select({
      mappingId: channelProductMappings.id,
      externalProductId: channelProductMappings.externalProductId,
      label: channelProductMappings.label,
      productId: channelProductMappings.productId,
      productName: products.name,
      productSku: products.sku,
      productCategory: products.category,
      sellingPrice: products.sellingPrice,
      quantityOnHand: products.quantityOnHand,
      channelName: channelProducts.name,
      channelSku: channelProducts.sku,
      channelStock: channelProducts.stockQuantity,
      channelRawData: channelProducts.rawData,
    })
    .from(channelProductMappings)
    .innerJoin(products, eq(channelProductMappings.productId, products.id))
    .innerJoin(
      channelProducts,
      and(
        eq(channelProducts.channelId, channelId),
        eq(channelProducts.externalId, channelProductMappings.externalProductId)
      )
    )
    .where(
      and(
        eq(channelProductMappings.channelId, channelId),
        eq(channelProductMappings.syncStatus, "pending_update"),
      ),
    );

  if (pendingMappings.length === 0) {
    return [];
  }

  // ── Group by amazonProductType (the stable SP-API flat-file key) ──────────
  type TemplateGroup = { entry: CategoryTemplateEntry; mappings: typeof pendingMappings };
  const byTemplate = new Map<string, TemplateGroup>();

  for (const mapping of pendingMappings) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelRaw = (mapping.channelRawData as any) || {};
    const amazonProductType: string | undefined = channelRaw.amazonProductType;

    if (!amazonProductType) {
      throw new Error(
        `Product mapping ${mapping.mappingId} is missing an Amazon product type. ` +
        `Re-sync the product to auto-populate it.`,
      );
    }

    const entry = getTemplateForProductType(amazonProductType);
    if (!entry) {
      throw new Error(
        `No Amazon template registered for product type "${amazonProductType}". ` +
        `Please drop the ${amazonProductType}.xlsm file in the category_product_upload_templates folder.`,
      );
    }

    const group = byTemplate.get(entry.amazonProductType) ?? { entry, mappings: [] };
    group.mappings.push(mapping);
    byTemplate.set(entry.amazonProductType, group);
  }

  // ── Mark all as file_generating ─────────────────────────────────────────
  const allMappingIds = pendingMappings.map((m) => m.mappingId);
  await db
    .update(channelProductMappings)
    .set({ syncStatus: "file_generating", lastSyncError: null })
    .where(inArray(channelProductMappings.id, allMappingIds));

  const client = new AmazonAPIClient(decryptedCreds, channel.storeUrl);
  const results: FeedSubmissionResult[] = [];

  for (const [, { entry, mappings }] of byTemplate.entries()) {
    const categoryMappingIds = mappings.map((m) => m.mappingId);
    const category = entry.label;

    try {
      // Build product rows for the template generator
      const templateProducts: TemplateProductRow[] = mappings.map((m) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawData = (m.channelRawData as any) || {};
        return {
          sku: m.channelSku || m.productSku || m.externalProductId,
          name: m.channelName || m.productName,
          price: (rawData.price !== undefined ? rawData.price : m.sellingPrice)?.toString(),
          quantity: m.channelStock !== null && m.channelStock !== undefined ? m.channelStock : m.quantityOnHand,
          category: entry.label,
        };
      });

      // Generate the .xlsm file using the pre-resolved template entry
      const { buffer } = await generateCategoryTemplate(entry, templateProducts);

      // Mark as uploading
      await db
        .update(channelProductMappings)
        .set({ syncStatus: "uploading" })
        .where(inArray(channelProductMappings.id, categoryMappingIds));

      // SP-API Feeds: Step 1 — Create feed document
      const { feedDocumentId, url: uploadUrl } = await client.createFeedDocument(XLSM_CONTENT_TYPE);

      // SP-API Feeds: Step 1b — Upload the .xlsm file to presigned URL
      await client.uploadFeedData(uploadUrl, buffer, XLSM_CONTENT_TYPE);

      // SP-API Feeds: Step 2 — Create the feed
      const { feedId } = await client.createFeed(entry.feedType, feedDocumentId);

      // Mark as processing
      await db
        .update(channelProductMappings)
        .set({ syncStatus: "processing" })
        .where(inArray(channelProductMappings.id, categoryMappingIds));

      // Record in channel_feeds table
      await db.insert(channelFeeds).values({
        channelId,
        feedId,
        feedDocumentId,
        feedType: entry.feedType,
        category,
        status: "in_progress",
        productCount: mappings.length,
        uploadUrl,
      });

      results.push({
        category,
        feedId,
        feedDocumentId,
        uploadUrl,
        productCount: mappings.length,
      });
    } catch (err) {
      const errorMsg = String(err).replace(/^Error:\s*/, "").substring(0, 500);
      console.error(`[Amazon Feeds] Failed to submit feed for category "${category}"`, err);

      // Mark these mappings as failed
      await db
        .update(channelProductMappings)
        .set({ syncStatus: "failed", lastSyncError: errorMsg })
        .where(inArray(channelProductMappings.id, categoryMappingIds));

      // Record the failed feed
      await db.insert(channelFeeds).values({
        channelId,
        feedType: "POST_FLAT_FILE_INVLOADER_DATA",
        category,
        status: "fatal",
        productCount: mappings.length,
        errorMessage: errorMsg,
      });
    }
  }

  return results;
}

/**
 * Check the status of an Amazon feed and update the channel_feeds row.
 * Call this periodically or on-demand from the Uploads dashboard.
 */
export async function pollFeedStatus(feedRowId: number): Promise<{
  status: string;
  resultDocumentUrl?: string;
}> {
  const feedRows = await db
    .select({
      id: channelFeeds.id,
      feedId: channelFeeds.feedId,
      channelId: channelFeeds.channelId,
      status: channelFeeds.status,
    })
    .from(channelFeeds)
    .where(eq(channelFeeds.id, feedRowId))
    .limit(1);

  if (feedRows.length === 0) throw new Error("Feed record not found.");

  const feedRow = feedRows[0];
  if (!feedRow.feedId) throw new Error("Feed has not been submitted to Amazon yet.");
  if (feedRow.status === "done" || feedRow.status === "fatal") {
    return { status: feedRow.status };
  }

  // Get channel credentials
  const channelRows = await db
    .select({
      storeUrl: channels.storeUrl,
      credentials: channels.credentials,
    })
    .from(channels)
    .where(eq(channels.id, feedRow.channelId))
    .limit(1);

  if (channelRows.length === 0) throw new Error("Channel not found.");

  const channel = channelRows[0];
  const decryptedCreds = decryptChannelCredentials(channel.credentials);
  const client = new AmazonAPIClient(decryptedCreds, channel.storeUrl || "");

  const feedStatus = await client.getFeed(feedRow.feedId);

  let resultDocumentUrl: string | undefined;

  if (feedStatus.processingStatus === "DONE") {
    // Fetch result document URL if available
    if (feedStatus.resultFeedDocumentId) {
      try {
        const resultDoc = await client.getFeedDocument(feedStatus.resultFeedDocumentId);
        resultDocumentUrl = resultDoc.url;
      } catch (err) {
        console.warn("[Amazon Feeds] Failed to get result document", err);
      }
    }

    await db
      .update(channelFeeds)
      .set({
        status: "done",
        resultDocumentUrl: resultDocumentUrl ?? null,
        updatedAt: new Date(),
      })
      .where(eq(channelFeeds.id, feedRowId));

    // Mark all related mappings as in_sync
    // (We'd need to track which mappings belong to which feed for precision,
    //  but for now we clear all `processing` mappings for this channel)
    await db
      .update(channelProductMappings)
      .set({ syncStatus: "in_sync", lastSyncError: null })
      .where(
        and(
          eq(channelProductMappings.channelId, feedRow.channelId),
          eq(channelProductMappings.syncStatus, "processing"),
        ),
      );

    return { status: "done", resultDocumentUrl };
  }

  if (feedStatus.processingStatus === "CANCELLED" || feedStatus.processingStatus === "FATAL") {
    await db
      .update(channelFeeds)
      .set({
        status: "fatal",
        errorMessage: `Feed processing failed: ${feedStatus.processingStatus}`,
        updatedAt: new Date(),
      })
      .where(eq(channelFeeds.id, feedRowId));

    // Mark related mappings as failed
    await db
      .update(channelProductMappings)
      .set({
        syncStatus: "failed",
        lastSyncError: `Feed ${feedStatus.processingStatus}`,
      })
      .where(
        and(
          eq(channelProductMappings.channelId, feedRow.channelId),
          eq(channelProductMappings.syncStatus, "processing"),
        ),
      );

    return { status: "fatal" };
  }

  // Still processing — update timestamp
  await db
    .update(channelFeeds)
    .set({ updatedAt: new Date() })
    .where(eq(channelFeeds.id, feedRowId));

  return { status: feedStatus.processingStatus };
}

/**
 * Delete a feed record from the database.
 * This is useful for clearing out failed or stuck feeds.
 */
export async function deleteAmazonFeedRecord(feedRowId: number): Promise<void> {
  await db.delete(channelFeeds).where(eq(channelFeeds.id, feedRowId));
}
