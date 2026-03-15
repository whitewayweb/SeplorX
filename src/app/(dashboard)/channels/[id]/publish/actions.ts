"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pushChannelProductUpdatesService } from "@/lib/channels/services";
import { getAuthenticatedUserId } from "@/lib/auth";

/**
 * Generic server action: push all pending_update product mappings
 * for ANY channel that declares capabilities.canPushProductUpdates = true.
 *
 * Routing to the correct channel implementation is handled entirely by
 * the handler registry — no channel-type switch needed here.
 */
export async function pushChannelProductUpdates(channelId: number) {
  const parsed = z.number().int().positive().safeParse(channelId);
  if (!parsed.success) return { error: "Invalid channel ID." };

  try {
    const userId = await getAuthenticatedUserId();
    const summary = await pushChannelProductUpdatesService(userId, parsed.data);

    revalidatePath(`/products/channels/${parsed.data}`);
    revalidatePath(`/channels/${parsed.data}/publish`);

    return { success: true, ...summary };
  } catch (err) {
    console.error("[pushChannelProductUpdates]", { channelId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "").substring(0, 300) };
  }
}
