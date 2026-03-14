"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { submitPendingUpdates, pollFeedStatus } from "@/lib/channels/amazon/feeds";
import { getAuthenticatedUserId } from "@/lib/auth";

/**
 * Submit all pending product updates for an Amazon channel.
 * Generates .xlsm template files per category and uploads via SP-API Feeds.
 */
export async function submitAmazonFeedUpdates(channelId: number) {
  const parsed = z.number().int().positive().safeParse(channelId);
  if (!parsed.success) return { error: "Invalid channel ID." };

  try {
    const userId = await getAuthenticatedUserId();
    const results = await submitPendingUpdates(userId, parsed.data);

    revalidatePath(`/products/channels/${parsed.data}`);
    revalidatePath(`/channels/${parsed.data}/feeds`);

    if (results.length === 0) {
      return { success: true, message: "No pending updates to submit.", results: [] };
    }

    return { success: true, results };
  } catch (err) {
    console.error("[submitAmazonFeedUpdates]", { channelId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "").substring(0, 300) };
  }
}

/**
 * Poll the status of an Amazon feed submission.
 */
export async function checkFeedStatus(feedRowId: number) {
  const parsed = z.number().int().positive().safeParse(feedRowId);
  if (!parsed.success) return { error: "Invalid feed ID." };

  try {
    await getAuthenticatedUserId(); // Auth guard
    const result = await pollFeedStatus(parsed.data);

    return { success: true, ...result };
  } catch (err) {
    console.error("[checkFeedStatus]", { feedRowId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "").substring(0, 300) };
  }
}

/**
 * Delete a failed/stuck Amazon feed submission record.
 */
export async function deleteFeedRecord(feedRowId: number) {
  const parsed = z.number().int().positive().safeParse(feedRowId);
  if (!parsed.success) return { error: "Invalid feed ID." };

  try {
    await getAuthenticatedUserId(); // Auth guard

    // dynamic import since the file exports db functions
    const { deleteAmazonFeedRecord } = await import("@/lib/channels/amazon/feeds/service");
    await deleteAmazonFeedRecord(parsed.data);

    // Note: Revalidation should happen in the client component manually
    // via router.refresh() because this isn't tied to a specific URL path param naturally here 
    // unless we pass channelId. But router.refresh() works well.
    return { success: true };
  } catch (err) {
    console.error("[deleteFeedRecord]", { feedRowId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "").substring(0, 300) };
  }
}

