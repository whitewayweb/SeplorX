"use server";

import { getAuthenticatedUserId } from "@/lib/auth";
import { getChannelHandler } from "@/lib/channels/handlers";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";

import { db } from "@/db";
import { channels, salesOrders } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ChannelIdSchema } from "@/lib/validations/channels";
import type { OrderFinanceSyncOptions, OrderFinanceSyncResult } from "@/lib/channels/types";

type SyncOrderFinancesActionResult =
  | ({ success: true } & OrderFinanceSyncResult)
  | { success: false; error: string };

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
 * Server Action to sync finance events for a channel, optionally scoped to one order.
 */
export async function syncOrderFinancesAction(
  rawChannelId: unknown,
  rawOrderId?: unknown,
  rawOptions: Pick<OrderFinanceSyncOptions, "limit" | "retryFailed"> = {},
): Promise<SyncOrderFinancesActionResult> {
  const parsed = ChannelIdSchema.safeParse({ id: rawChannelId });
  if (!parsed.success) {
    logger.error("[syncOrderFinancesAction]", {
      channelId: rawChannelId,
      orderId: rawOrderId,
      userId: "unknown",
      error: "Validation failed",
    });
    return { success: false, error: "Invalid channelId" };
  }

  const orderId =
    rawOrderId === undefined || rawOrderId === null
      ? undefined
      : Number(rawOrderId);
  if (orderId !== undefined && (!Number.isInteger(orderId) || orderId <= 0)) {
    return { success: false, error: "Invalid orderId" };
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

  if (orderId !== undefined) {
    const [order] = await db
      .select({ id: salesOrders.id })
      .from(salesOrders)
      .where(and(eq(salesOrders.id, orderId), eq(salesOrders.channelId, channelId)))
      .limit(1);

    if (!order) return { success: false, error: "Order not found" };
  }

  const handler = getChannelHandler(channel.channelType);
  if (!handler?.syncOrderFinances) {
    return { success: false, error: "Finance sync is not supported for this channel." };
  }

  try {
    const requestedLimit = Number(rawOptions.limit);
    const limit = orderId
      ? 1
      : Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 20)
        : 20;

    const result = await handler.syncOrderFinances(userId, channelId, {
      orderId,
      limit,
      retryFailed: rawOptions.retryFailed ?? true,
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/channels/${channelId}`);
    if (orderId) revalidatePath(`/orders/${orderId}`);

    return { success: true, ...result };
  } catch (err) {
    logger.error("[syncOrderFinancesAction]", {
      channelId,
      orderId,
      userId,
      error: String(err),
    });
    return { success: false, error: "Finance sync failed. Check server logs for details." };
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
