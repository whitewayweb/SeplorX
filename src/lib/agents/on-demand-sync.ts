import { db } from "@/db";
import { channels } from "@/db/schema";
import { and, eq, or, lte, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { getBaseUrl } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { channelRegistry } from "@/lib/channels/registry";
import { ORDER_SYNC_INTERVAL_MS } from "@/lib/agents/order-sync-state";

const AMAZON_FINANCE_DELAY_MS = 48 * 60 * 60 * 1000;
const FINANCE_RETRY_COOLDOWN_MS = 60 * 60 * 1000;
const FINANCE_SUPPORTED_CHANNEL_TYPES = channelRegistry
    .filter((channel) => channel.capabilities?.canSyncOrderFinances)
    .map((channel) => channel.id);

const lastTriggerByUser = new Map<number, number>();

function isRouterPrefetch(headersList: Pick<Headers, "get">): boolean {
    return (
        headersList.get("next-router-prefetch") === "1" ||
        headersList.get("purpose") === "prefetch" ||
        headersList.get("sec-purpose")?.includes("prefetch") === true
    );
}

/**
 * Checks if any of the user's channels are "stale" (not synced in > 15 mins)
 * and triggers a background sync if needed.
 * 
 * This allows "Always Active" behavior on Vercel Hobby plan by triggering
 * the agent whenever the user is active in the portal.
 */
export async function triggerOnDemandSync(userId: number) {
    const headerList = await headers();
    if (isRouterPrefetch(headerList)) return;

    const lastTriggerAt = lastTriggerByUser.get(userId);
    if (lastTriggerAt && Date.now() - lastTriggerAt < ORDER_SYNC_INTERVAL_MS) return;

    const staleTime = new Date(Date.now() - ORDER_SYNC_INTERVAL_MS);
    const financeRetryBefore = new Date(Date.now() - FINANCE_RETRY_COOLDOWN_MS);
    
    // 1. Check for stale connected channels or finance work that is ready.
    // Order sync handlers also run finance reconciliation, so this reuses the
    // existing active-browser scheduler instead of creating another poller.
    const staleChannels = await logger.measure("on-demand-sync stale-channel check", { component: "on-demand-sync", userId }, async () =>
        db.select({ id: channels.id })
        .from(channels)
        .where(
            and(
                eq(channels.userId, userId),
                eq(channels.status, 'connected'),
                or(
                    isNull(channels.orderSyncStartedAt),
                    lte(channels.orderSyncStartedAt, staleTime)
                ),
                or(
                    isNull(channels.lastOrderSyncAt),
                    lte(channels.lastOrderSyncAt, staleTime),
                    sql`exists (
                        select 1
                        from sales_orders so
                        left join sales_order_finance_syncs sofs
                          on sofs.order_id = so.id
                        where so.channel_id = ${channels.id}
                          and ${channels.channelType} in ${FINANCE_SUPPORTED_CHANNEL_TYPES}
                          and so.status in (
                            'pending',
                            'processing',
                            'on-hold',
                            'packed',
                            'shipped',
                            'delivered',
                            'returned',
                            'refunded'
                          )
                          and (
                            sofs.status is null
                            or (
                              sofs.status in ('pending', 'no_data', 'failed')
                              and (
                                sofs.next_attempt_at is null
                                or sofs.next_attempt_at <= ${financeRetryBefore.toISOString()}
                              )
                            )
                          )
                          and (
                            ${channels.channelType} <> 'amazon'
                            or so.purchased_at <= ${new Date(Date.now() - AMAZON_FINANCE_DELAY_MS).toISOString()}
                          )
                    )`
                )
            )
        )
        .limit(1)
    );

    if (staleChannels.length === 0) return;

    // 2. Trigger the scheduler in the background
    lastTriggerByUser.set(userId, Date.now());
    const baseUrl = getBaseUrl(headerList);
    const url = `${baseUrl}/api/cron/order-sync?userId=${userId}`;

    logger.info("triggering scheduler", { component: "on-demand-sync", userId });

    after(async () => {
        await fetch(url, {
            method: "GET",
            headers: {
                "x-vercel-cron": "1",
            },
            cache: "no-store",
        }).catch(err => logger.error("background trigger failed", { component: "on-demand-sync", userId, error: err }));
    });
}
