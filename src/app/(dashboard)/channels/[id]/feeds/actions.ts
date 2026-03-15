"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { submitPendingUpdates, pollFeedStatus, deleteAmazonFeedRecordForUser } from "@/lib/channels/amazon/feeds";
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
    const userId = await getAuthenticatedUserId();
    // Pass userId so pollFeedStatus can scope the query by ownership (IDOR prevention)
    const result = await pollFeedStatus(userId, parsed.data);

    return { success: true, ...result };
  } catch (err) {
    console.error("[checkFeedStatus]", { feedRowId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "").substring(0, 300) };
  }
}

/**
 * Delete a failed/stuck Amazon feed submission record.
 * Requires the authenticated user to own the feed's channel (IDOR prevention).
 * Also triggers server-side revalidation so the feeds list stays fresh.
 */
export async function deleteFeedRecord(feedRowId: number, channelId: number) {
  const parsedFeed    = z.number().int().positive().safeParse(feedRowId);
  const parsedChannel = z.number().int().positive().safeParse(channelId);
  if (!parsedFeed.success || !parsedChannel.success) return { error: "Invalid feed or channel ID." };

  try {
    const userId = await getAuthenticatedUserId();
    await deleteAmazonFeedRecordForUser(userId, parsedFeed.data);

    revalidatePath(`/channels/${parsedChannel.data}/feeds`);
    revalidatePath(`/products/channels/${parsedChannel.data}`);
    return { success: true };
  } catch (err) {
    console.error("[deleteFeedRecord]", { feedRowId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "").substring(0, 300) };
  }
}
