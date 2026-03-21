"use server";

import { getAuthenticatedUserId } from "@/lib/auth";
import { getChannelHandler } from "@/lib/channels/handlers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { channels, salesOrders } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const channelIdSchema = z.coerce.number().int().positive();

/**
 * Server Action to fetch orders from a specific channel instance.
 */
export async function fetchChannelOrdersAction(rawChannelId: unknown) {
  const parsed = channelIdSchema.safeParse(rawChannelId);
  if (!parsed.success) return { success: false, error: "Invalid channelId" };
  const channelId = parsed.data;

  const userId = await getAuthenticatedUserId();
  if (!userId) throw new Error("Unauthorized");

  const [channel] = await db
    .select({ channelType: channels.channelType })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (!channel) return { success: false, error: "Channel not found" };

  const handler = getChannelHandler(channel.channelType);
  if (!handler || !handler.fetchAndSaveOrders) {
    throw new Error(`${channel.channelType} order handler not implemented or configured.`);
  }

  try {
    const result = await handler.fetchAndSaveOrders(userId, channelId);
    revalidatePath("/orders");
    revalidatePath(`/orders/channels/${channelId}`);
    return { success: true, ...result };
  } catch (err) {
    console.error("[fetchChannelOrdersAction]", { channelId, userId, error: String(err) });
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
    const [channel] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
      .limit(1);
      
    if (!channel) throw new Error("Not authorized");

    await db.delete(salesOrders).where(eq(salesOrders.channelId, channelId));
    
    revalidatePath("/orders");
    revalidatePath(`/orders/channels/${channelId}`);
    return { success: true };
  } catch (err) {
    console.error("[clearChannelOrdersAction]", { channelId, userId, error: String(err) });
    return { error: String(err) };
  }
}

