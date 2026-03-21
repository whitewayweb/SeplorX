"use server";

import { getAuthenticatedUserId } from "@/lib/auth";
import { getChannelHandler } from "@/lib/channels/handlers";
import { revalidatePath } from "next/cache";
import { clearChannelOrders } from "@/lib/channels/amazon/queries";
import { z } from "zod";

const channelIdSchema = z.coerce.number().int().positive();

/**
 * Server Action to fetch orders from a specific Amazon channel.
 */
export async function fetchAmazonOrdersAction(rawChannelId: unknown) {
  const parsed = channelIdSchema.safeParse(rawChannelId);
  if (!parsed.success) return { success: false, error: "Invalid channelId" };
  const channelId = parsed.data;

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
    console.error("[fetchAmazonOrdersAction]", { channelId, userId, error: String(err) });
    return { success: false, error: String(err) };
  }
}

/**
 * Permanently delete all syncronized orders for a channel.
 */
export async function clearChannelOrdersAction(rawChannelId: unknown) {
  const parsed = channelIdSchema.safeParse(rawChannelId);
  if (!parsed.success) return { error: "Invalid channelId" };
  const channelId = parsed.data;

  const userId = await getAuthenticatedUserId();
  if (!userId) throw new Error("Unauthorized");

  try {
    await clearChannelOrders(userId, channelId);
    revalidatePath("/orders");
    revalidatePath(`/orders/channels/${channelId}`);
    return { success: true };
  } catch (err) {
    console.error("[clearChannelOrdersAction]", { channelId, userId, error: String(err) });
    return { error: String(err) };
  }
}

