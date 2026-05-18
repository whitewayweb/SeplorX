import { db, type QueryClient } from "@/db";
import { channels, settings } from "@/db/schema";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { and, eq, isNull, lte, or } from "drizzle-orm";

const ORDER_SYNC_AGENT_SETTING_KEY = "agent:orderSync:isActive";

export const ORDER_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const ORDER_SYNC_CLAIM_TIMEOUT_MS = ORDER_SYNC_INTERVAL_MS;

export async function isOrderSyncEnabled(tx: QueryClient = db): Promise<boolean> {
  const [setting] = await tx
    .select()
    .from(settings)
    .where(eq(settings.key, ORDER_SYNC_AGENT_SETTING_KEY));

  return setting !== undefined
    ? (setting.value as boolean)
    : AGENT_REGISTRY.orderSync.enabled;
}

export async function claimOrderSyncChannel(
  channelId: number,
  now = new Date(),
  tx: QueryClient = db,
) {
  const claimStaleBefore = new Date(now.getTime() - ORDER_SYNC_CLAIM_TIMEOUT_MS);
  const [channel] = await tx
    .update(channels)
    .set({ orderSyncStartedAt: now })
    .where(
      and(
        eq(channels.id, channelId),
        eq(channels.status, "connected"),
        or(
          isNull(channels.orderSyncStartedAt),
          lte(channels.orderSyncStartedAt, claimStaleBefore),
        ),
      ),
    )
    .returning();

  return channel ?? null;
}

export async function markOrderSyncSucceeded(
  channelId: number,
  options: { userId?: number; now?: Date } = {},
  tx: QueryClient = db,
): Promise<void> {
  await tx
    .update(channels)
    .set({
      lastOrderSyncAt: options.now ?? new Date(),
      orderSyncStartedAt: null,
    })
    .where(
      and(
        eq(channels.id, channelId),
        options.userId ? eq(channels.userId, options.userId) : undefined,
      ),
    );
}

export async function releaseOrderSyncClaim(
  channelId: number,
  tx: QueryClient = db,
): Promise<void> {
  await tx
    .update(channels)
    .set({ orderSyncStartedAt: null })
    .where(eq(channels.id, channelId));
}
