import { db } from "@/db";
import { channels } from "@/db/schema";
import { and, eq, or, lte, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { getBaseUrl } from "@/lib/utils";
import { logger } from "@/lib/logger";

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Checks if any of the user's channels are "stale" (not synced in > 15 mins)
 * and triggers a background sync if needed.
 * 
 * This allows "Always Active" behavior on Vercel Hobby plan by triggering
 * the agent whenever the user is active in the portal.
 */
export async function triggerOnDemandSync(userId: number) {
    const startedAt = Date.now();
    const staleTime = new Date(Date.now() - SYNC_INTERVAL_MS);
    
    // 1. Check for stale connected channels
    const staleChannels = await db.select({ id: channels.id })
        .from(channels)
        .where(
            and(
                eq(channels.userId, userId),
                eq(channels.status, 'connected'),
                or(
                    isNull(channels.lastOrderSyncAt),
                    lte(channels.lastOrderSyncAt, staleTime)
                )
            )
        )
        .limit(1);

    logger.info("[on-demand-sync] stale channel check complete", {
        durationMs: Date.now() - startedAt,
        staleChannelCount: staleChannels.length,
    });

    if (staleChannels.length === 0) return;

    // 2. Trigger the scheduler in the background
    const headerList = await headers();
    const baseUrl = getBaseUrl(headerList);
    const url = `${baseUrl}/api/cron/order-sync?userId=${userId}`;

    logger.info("[on-demand-sync] triggering background order sync", {
        durationMs: Date.now() - startedAt,
        baseUrl,
    });

    // Fire and forget (don't await)
    fetch(url, {
        method: "GET",
        headers: {
            "x-vercel-cron": "1",
        },
        cache: "no-store",
    }).catch(err => logger.error("[on-demand-sync] background trigger failed", err));
}
