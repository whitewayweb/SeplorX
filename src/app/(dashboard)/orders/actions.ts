"use server";

import { getAuthenticatedUserId } from "@/lib/auth";
import { getChannelHandler } from "@/lib/channels/handlers";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";

import { db } from "@/db";
import { channels, salesOrders } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ChannelIdSchema } from "@/lib/validations/channels";

/**
 * Server Action to fetch orders from a specific channel instance.
 */
export async function fetchChannelOrdersAction(rawChannelId: unknown) {
  const parsed = ChannelIdSchema.safeParse({ id: rawChannelId });
  if (!parsed.success) {
    logger.error("[fetchChannelOrdersAction]", { channelId: rawChannelId, userId: "unknown", error: "Validation failed" });
    return { success: false, error: "Invalid channelId" };
  }
  const channelId = parsed.data.id;

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

    // Update the last_order_sync_at cursor on success (ensures manual syncs advance the cursor)
    await db.update(channels)
      .set({ lastOrderSyncAt: new Date() })
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)));

    revalidatePath("/orders");
    revalidatePath(`/orders/channels/${channelId}`);
    return { success: true, ...result };
  } catch (err) {
    logger.error("[fetchChannelOrdersAction]", { channelId, userId, error: String(err) });
    return { success: false, error: String(err) };
  }
}

/**
 * Permanently delete all syncronized orders for a channel.
 */
export async function clearChannelOrdersAction(rawChannelId: unknown) {
  const parsed = ChannelIdSchema.safeParse({ id: rawChannelId });
  if (!parsed.success) {
    logger.error("[clearChannelOrdersAction]", { channelId: rawChannelId, userId: "unknown", error: "Validation failed" });
    return { error: "Invalid channelId" };
  }
  const channelId = parsed.data.id;

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    logger.error("[clearChannelOrdersAction]", { channelId, userId: null, error: "Unauthorized" });
    throw new Error("Unauthorized");
  }

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
    logger.error("[clearChannelOrdersAction]", { channelId, userId, error: String(err) });
    return { error: String(err) };
  }
}

/**
 * Server Action for processing a return (restock or discard) on a specific order item.
 */
export async function processReturnAction(data: {
  orderItemId: number;
  action: "restock" | "discard";
  quantity: number;
  notes?: string;
}) {
  const userId = await getAuthenticatedUserId();
  if (!userId) throw new Error("Unauthorized");

  // Defense-in-depth: validate quantity before calling stock service
  const qty = Number(data.quantity);
  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
    return { success: false, error: "Quantity must be a positive integer." };
  }

  const { processReturnItem } = await import("@/lib/stock/service");

  try {
    await processReturnItem(
      data.orderItemId,
      data.action,
      data.quantity,
      userId,
      data.notes,
    );

    revalidatePath("/orders");
    revalidatePath("/inventory");
    revalidatePath("/products");
    return { success: true };
  } catch (err) {
    logger.error("[processReturnAction]", { ...data, userId, error: String(err) });
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
