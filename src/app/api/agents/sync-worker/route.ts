import { NextResponse, after } from "next/server";
import { getChannelHandler } from "@/lib/channels/handlers";
import {
  claimOrderSyncChannel,
  isOrderSyncEnabled,
  markOrderSyncSucceeded,
  releaseOrderSyncClaim,
} from "@/lib/agents/order-sync-state";
import { logger } from "@/lib/logger";

const BACKGROUND_FINANCE_SYNC_LIMIT = 10;

export const maxDuration = 60;

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  try {
    // 1. Authorization
    const authHeader = request.headers.get("authorization");
    const isVercelCron = request.headers.get("x-vercel-cron") === "1";

    if (authHeader !== `Bearer ${process.env.CRON_JOB_KEY}` && !isVercelCron) {
      logger.warn("[sync-worker] unauthorized trigger", {
        isVercelCron,
        durationMs: Date.now() - requestStartedAt,
      });
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

    logger.info("[sync-worker] request received", {
      channelId,
      financeOnly,
    });

    // 4. Atomically claim the channel. This prevents concurrent scheduler
    // invocations from starting duplicate workers for the same channel while
    // still allowing retry after a stale claim timeout.
    const channel = await claimOrderSyncChannel(channelId);

    if (!channel) {
      logger.info("[sync-worker] claim skipped", {
        channelId,
        financeOnly,
        reason: "Channel is disconnected or already syncing",
        durationMs: Date.now() - requestStartedAt,
      });
      return NextResponse.json({ skipped: true, reason: "Channel is disconnected or already syncing" }, { status: 202 });
    }

    // 5. Execute Handler (Fire-and-forget in background)
    const handler = getChannelHandler(channel.channelType);
    if (!handler?.fetchAndSaveOrders && !handler?.syncOrderFinances) {
      await releaseOrderSyncClaim(channel.id);
      logger.info("[sync-worker] unsupported channel handler", {
        channelId,
        channelType: channel.channelType,
        durationMs: Date.now() - requestStartedAt,
      });
      return NextResponse.json({ skipped: true, reason: "Handler does not support order or finance sync" });
    }

    // Use after() introduced in Next.js 15+ to run the heavy work after response is sent
    after(async () => {
      const startTime = Date.now();
      let orderSyncSucceeded = false;
      let orderSyncSavedOrders = false;
      let financeBatchWasFull = false;

      if (handler.syncOrderFinances) {
        const financeStartedAt = Date.now();
        try {
          logger.info("[sync-worker] finance sync starting", {
            channelId,
            channelType: channel.channelType,
            limit: BACKGROUND_FINANCE_SYNC_LIMIT,
            retryFailed: true,
          });
          const result = await handler.syncOrderFinances(channel.userId, channel.id, {
            limit: BACKGROUND_FINANCE_SYNC_LIMIT,
            retryFailed: true,
          });
          financeBatchWasFull = result.checked >= BACKGROUND_FINANCE_SYNC_LIMIT;
          logger.info("[sync-worker] finance sync completed", {
            channelId,
            channelType: channel.channelType,
            externalFinanceChecks: result.checked,
            synced: result.synced,
            noData: result.noData,
            failed: result.failed,
            notSupported: result.notSupported,
            durationMs: Date.now() - financeStartedAt,
          });
        } catch (err) {
          logger.error("[sync-worker] finance sync failed", {
            channelId,
            channelType: channel.channelType,
            durationMs: Date.now() - financeStartedAt,
            error: err,
          });
        }
      }

      if (!financeOnly && handler.fetchAndSaveOrders) {
        const orderStartedAt = Date.now();
        try {
          logger.info("[sync-worker] order sync starting", {
            channelId,
            channelType: channel.channelType,
          });
          const result = await handler.fetchAndSaveOrders(channel.userId, channel.id);
          orderSyncSucceeded = true;
          orderSyncSavedOrders = result.saved > 0;

          logger.info("[sync-worker] order sync completed", {
            channelId,
            channelType: channel.channelType,
            externalOrdersFetched: result.fetched,
            ordersSaved: result.saved,
            durationMs: Date.now() - orderStartedAt,
          });
        } catch (err) {
          logger.error("[sync-worker] order sync failed", {
            channelId,
            channelType: channel.channelType,
            durationMs: Date.now() - orderStartedAt,
            error: err,
          });
        }
      }

      try {
        if (orderSyncSucceeded) {
          await markOrderSyncSucceeded(channel.id);
        } else {
          await releaseOrderSyncClaim(channel.id);
        }
      } catch (err) {
        logger.error("[sync-worker] failed to finalize sync claim", {
          channelId,
          durationMs: Date.now() - startTime,
          error: err,
        });
      }

      if (handler.syncOrderFinances && (financeBatchWasFull || orderSyncSavedOrders)) {
        logger.info("[sync-worker] dispatching finance continuation", {
          channelId,
          financeBatchWasFull,
          orderSyncSavedOrders,
        });
        fetch(workerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.CRON_JOB_KEY}`,
          },
          body: JSON.stringify({ channelId: channel.id, financeOnly: true }),
          cache: "no-store",
        }).catch((err) => {
          logger.error("[sync-worker] failed to continue finance backlog", {
            channelId,
            error: err,
          });
        });
      }

      logger.info("[sync-worker] background work completed", {
        channelId,
        financeOnly,
        durationMs: Date.now() - startTime,
      });
    });

    logger.info("[sync-worker] accepted", {
      channelId,
      financeOnly,
      durationMs: Date.now() - requestStartedAt,
    });
    return NextResponse.json({ success: true, message: "Sync triggered in background" }, { status: 202 });
  } catch (error) {
    logger.error("[agent/sync-worker] fatal error parsing request", {
      durationMs: Date.now() - requestStartedAt,
      error,
    });
    return NextResponse.json({ error: "Worker failed" }, { status: 500 });
  }
}
