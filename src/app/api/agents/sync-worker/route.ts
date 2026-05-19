import { NextResponse, after } from "next/server";
import { getChannelHandler } from "@/lib/channels/handlers";
import {
  claimOrderSyncChannel,
  isOrderSyncEnabled,
  markOrderSyncSucceeded,
  releaseOrderSyncClaim,
} from "@/lib/agents/order-sync-state";

const BACKGROUND_FINANCE_SYNC_LIMIT = 10;

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    // 1. Authorization
    const authHeader = request.headers.get("authorization");
    const isVercelCron = request.headers.get("x-vercel-cron") === "1";

    if (authHeader !== `Bearer ${process.env.CRON_JOB_KEY}` && !isVercelCron) {
      console.warn(`[sync-worker] Unauthorized attempt to trigger worker (Header: ${authHeader?.substring(0, 10)}..., isVercelCron: ${isVercelCron})`);
      return new Response("Unauthorized", { status: 401 });
    }

    // 2. Settings check
    if (!(await isOrderSyncEnabled())) {
      return NextResponse.json({ error: "Order Sync agent is disabled." }, { status: 503 });
    }

    // 3. Payload
    const body = await request.json().catch(() => ({}));
    if (!body.channelId) {
      return NextResponse.json({ error: "Missing channelId" }, { status: 400 });
    }

    const channelId = Number(body.channelId);
    const financeOnly = body.financeOnly === true;
    const workerUrl = new URL("/api/agents/sync-worker", request.url).toString();

    // 4. Atomically claim the channel. This prevents concurrent scheduler
    // invocations from starting duplicate workers for the same channel while
    // still allowing retry after a stale claim timeout.
    const channel = await claimOrderSyncChannel(channelId);

    if (!channel) {
      return NextResponse.json({ skipped: true, reason: "Channel is disconnected or already syncing" }, { status: 202 });
    }

    // 5. Execute Handler (Fire-and-forget in background)
    const handler = getChannelHandler(channel.channelType);
    if (!handler?.fetchAndSaveOrders && !handler?.syncOrderFinances) {
      await releaseOrderSyncClaim(channel.id);
      return NextResponse.json({ skipped: true, reason: "Handler does not support order or finance sync" });
    }

    // Use after() introduced in Next.js 15+ to run the heavy work after response is sent
    after(async () => {
      const startTime = Date.now();
      let orderSyncSucceeded = false;
      let orderSyncSavedOrders = false;
      let financeBatchWasFull = false;

      if (handler.syncOrderFinances) {
        try {
          const result = await handler.syncOrderFinances(channel.userId, channel.id, {
            limit: BACKGROUND_FINANCE_SYNC_LIMIT,
            retryFailed: true,
          });
          financeBatchWasFull = result.checked >= BACKGROUND_FINANCE_SYNC_LIMIT;
          console.log(
            `[sync-worker] [${channelId}] Finance sync: checked ${result.checked}, synced ${result.synced}, no data ${result.noData}, failed ${result.failed}.`,
          );
        } catch (err) {
          console.error(`[sync-worker] [${channelId}] Finance sync failed:`, err);
        }
      }

      if (!financeOnly && handler.fetchAndSaveOrders) {
        try {
          console.log(`[sync-worker] [${channelId}] Starting background sync for channel "${channel.name}"`);
          const result = await handler.fetchAndSaveOrders(channel.userId, channel.id);
          orderSyncSucceeded = true;
          orderSyncSavedOrders = result.saved > 0;

          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[sync-worker] [${channelId}] Success: fetched ${result.fetched}, saved ${result.saved} orders. Duration: ${duration}s`);
        } catch (err) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          console.error(`[sync-worker] [${channelId}] Order sync failed after ${duration}s:`, err);
        }
      }

      try {
        if (orderSyncSucceeded) {
          await markOrderSyncSucceeded(channel.id);
        } else {
          await releaseOrderSyncClaim(channel.id);
        }
      } catch (err) {
        console.error(`[sync-worker] [${channelId}] Failed to finalize sync claim:`, err);
      }

      if (handler.syncOrderFinances && (financeBatchWasFull || orderSyncSavedOrders)) {
        fetch(workerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.CRON_JOB_KEY}`,
          },
          body: JSON.stringify({ channelId: channel.id, financeOnly: true }),
          cache: "no-store",
        }).catch((err) => {
          console.error(`[sync-worker] [${channelId}] Failed to continue finance backlog:`, err);
        });
      }
    });

    return NextResponse.json({ success: true, message: "Sync triggered in background" }, { status: 202 });
  } catch (error) {
    console.error(`[agent/sync-worker] Fatal error parsing request:`, error);
    return NextResponse.json({ error: "Worker failed" }, { status: 500 });
  }
}
