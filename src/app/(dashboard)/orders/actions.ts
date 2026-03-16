"use server";

import { getAuthenticatedUserId } from "@/lib/auth";
import { getChannelHandler } from "@/lib/channels/handlers";
import { revalidatePath } from "next/cache";

/**
 * Server Action to fetch orders from a specific Amazon channel.
 */
export async function fetchAmazonOrdersAction(channelId: number) {
  const userId = await getAuthenticatedUserId();
  if (!userId) throw new Error("Unauthorized");

  const handler = getChannelHandler("amazon");
  if (!handler || !handler.fetchAndSaveOrders) {
    throw new Error("Amazon order handler not implemented or configured.");
  }

  try {
    const result = await handler.fetchAndSaveOrders(userId, channelId);
    revalidatePath("/orders");
    revalidatePath(`/orders/channels/${channelId}`);
    return { success: true, ...result };
  } catch (err) {
    console.error("[fetchAmazonOrdersAction] Error:", err);
    return { success: false, error: String(err) };
  }
}
