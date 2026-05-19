"use server";

import { getAuthenticatedUserId } from "@/lib/auth";
import { getChannelHandler } from "@/lib/channels/handlers";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { markOrderSyncSucceeded } from "@/lib/agents/order-sync-state";

import { db } from "@/db";
import { channels, salesOrderFinanceSyncs, salesOrders } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ChannelIdSchema } from "@/lib/validations/channels";
import type { OrderFinanceSyncOptions, OrderFinanceSyncResult } from "@/lib/channels/types";
import {
  getFinanceSkipReason,
  shouldSyncOrderFinance,
} from "@/lib/order-finance/eligibility";

type SyncOrderFinancesActionResult =
  | ({ success: true } & OrderFinanceSyncResult)
  | { success: false; error: string };

type SmartSyncSelectedOrderActionResult =
  | {
      success: true;
      orderSync: {
        fetched: number;
        updated: number;
        failed: number;
      };
      financeSync: {
        checked: number;
        synced: number;
        noData: number;
        failed: number;
        skipped: 0 | 1;
        skipReason: string | null;
      };
    }
  | { success: false; error: string };

type SmartOrderFinanceSummary = Extract<
  SmartSyncSelectedOrderActionResult,
  { success: true }
>["financeSync"];

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

    await markOrderSyncSucceeded(channelId, { userId });

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

export async function smartSyncSelectedOrderAction(rawOrderId: unknown): Promise<SmartSyncSelectedOrderActionResult> {
  const orderId = Number(rawOrderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { success: false, error: "Invalid orderId" };
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) throw new Error("Unauthorized");

  const [selectedOrder] = await db
    .select({
      id: salesOrders.id,
      channelId: salesOrders.channelId,
      channelType: channels.channelType,
      externalOrderId: salesOrders.externalOrderId,
    })
    .from(salesOrders)
    .innerJoin(channels, and(eq(salesOrders.channelId, channels.id), eq(channels.userId, userId)))
    .where(eq(salesOrders.id, orderId))
    .limit(1);

  if (!selectedOrder) {
    return { success: false, error: "Order not found." };
  }

  const orderSync = { fetched: 0, saved: 0, failed: 0 };
  const handler = getChannelHandler(selectedOrder.channelType);

  if (!handler?.refreshOrders) {
    return { success: false, error: "Selected-order sync is not supported for this channel." };
  }

  try {
    const result = await handler.refreshOrders(userId, selectedOrder.channelId, [selectedOrder.externalOrderId]);
    orderSync.fetched += result.fetched;
    orderSync.saved += result.saved;
  } catch (err) {
    orderSync.failed += 1;
    logger.error("[smartSyncSelectedOrderAction] order sync failed", {
      channelId: selectedOrder.channelId,
      orderId: selectedOrder.id,
      userId,
      error: String(err),
    });
  }

  if (orderSync.failed > 0) {
    return {
      success: true,
      orderSync: {
        fetched: orderSync.fetched,
        updated: orderSync.saved,
        failed: orderSync.failed,
      },
      financeSync: {
        checked: 0,
        synced: 0,
        noData: 0,
        failed: 0,
        skipped: 1,
        skipReason: "order refresh failed",
      },
    };
  }

  const [refreshedOrder] = await db
    .select({
      id: salesOrders.id,
      channelId: salesOrders.channelId,
      channelType: channels.channelType,
      status: salesOrders.status,
      financeSyncStatus: salesOrderFinanceSyncs.status,
    })
    .from(salesOrders)
    .innerJoin(channels, and(eq(salesOrders.channelId, channels.id), eq(channels.userId, userId)))
    .leftJoin(salesOrderFinanceSyncs, eq(salesOrderFinanceSyncs.orderId, salesOrders.id))
    .where(eq(salesOrders.id, selectedOrder.id))
    .limit(1);

  const financeSync: SmartOrderFinanceSummary = {
    checked: 0,
    synced: 0,
    noData: 0,
    failed: 0,
    skipped: 0,
    skipReason: null,
  };

  if (!refreshedOrder) {
    return { success: false, error: "Order not found after refresh." };
  }

  const skipReason = getFinanceSkipReason(refreshedOrder.status, refreshedOrder.financeSyncStatus);
  if (!handler.syncOrderFinances || !shouldSyncOrderFinance(refreshedOrder.status, refreshedOrder.financeSyncStatus)) {
    financeSync.skipped = 1;
    financeSync.skipReason = skipReason ?? "not supported";
  } else {
    try {
      const result = await handler.syncOrderFinances(userId, selectedOrder.channelId, {
        orderId: selectedOrder.id,
        limit: 1,
        retryFailed: true,
      });
      financeSync.checked += result.checked;
      financeSync.synced += result.synced;
      financeSync.noData += result.noData;
      financeSync.failed += result.failed;
      financeSync.skipped = result.notSupported > 0 ? 1 : 0;
      financeSync.skipReason = result.notSupported > 0 ? "not supported" : null;
    } catch (err) {
      financeSync.failed += 1;
      logger.error("[smartSyncSelectedOrderAction] finance sync failed", {
        channelId: selectedOrder.channelId,
        orderId: selectedOrder.id,
        userId,
        error: String(err),
      });
    }
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/channels/${selectedOrder.channelId}`);
  revalidatePath(`/orders/${selectedOrder.id}`);

  return {
    success: true,
    orderSync: {
      fetched: orderSync.fetched,
      updated: orderSync.saved,
      failed: orderSync.failed,
    },
    financeSync,
  };
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
