import { NextResponse, after } from "next/server";
import { getChannelHandler } from "@/lib/channels/handlers";
import type { OrderFinanceSyncResult } from "@/lib/channels/types";
import {
  claimOrderSyncChannel,
  isOrderSyncEnabled,
  markOrderSyncSucceeded,
  releaseOrderSyncClaim,
} from "@/lib/agents/order-sync-state";
import { logger } from "@/lib/logger";

const BACKGROUND_FINANCE_SYNC_LIMIT = 10;
const MAX_FINANCE_BATCHES_PER_WORKER = 3;
const DEFAULT_FINANCE_BATCH_BUDGET_MS = 5_000;
const AMAZON_FINANCE_BATCH_BUDGET_MS = 30_000;

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
      let financeBatches = 0;

      const financeTotals: OrderFinanceSyncResult = {
        checked: 0,
        synced: 0,
        noData: 0,
        failed: 0,
        notSupported: 0,
      };

      const remainingTimeMs = () => maxDuration * 1000 - (Date.now() - startTime);
      const minFinanceBatchBudgetMs =
        channel.channelType === "amazon"
          ? AMAZON_FINANCE_BATCH_BUDGET_MS
          : DEFAULT_FINANCE_BATCH_BUDGET_MS;

      const runFinanceBatch = async (reason: "initial" | "post_order" | "backlog"): Promise<boolean> => {
        if (!handler.syncOrderFinances) return false;

        const financeStartedAt = Date.now();
        financeBatches++;

        logger.info("[sync-worker] finance sync starting", {
          channelId,
          channelType: channel.channelType,
          batch: financeBatches,
          reason,
          limit: BACKGROUND_FINANCE_SYNC_LIMIT,
          retryFailed: true,
        });

        const result = await handler.syncOrderFinances(channel.userId, channel.id, {
          limit: BACKGROUND_FINANCE_SYNC_LIMIT,
          retryFailed: true,
        });

        financeTotals.checked += result.checked;
        financeTotals.synced += result.synced;
        financeTotals.noData += result.noData;
        financeTotals.failed += result.failed;
        financeTotals.notSupported += result.notSupported;

        logger.info("[sync-worker] finance sync completed", {
          channelId,
          channelType: channel.channelType,
          batch: financeBatches,
          reason,
          externalFinanceChecks: result.checked,
          synced: result.synced,
          noData: result.noData,
          failed: result.failed,
          notSupported: result.notSupported,
          durationMs: Date.now() - financeStartedAt,
        });

        return result.checked >= BACKGROUND_FINANCE_SYNC_LIMIT;
      };

      if (handler.syncOrderFinances) {
        try {
          await runFinanceBatch("initial");
        } catch (err) {
          logger.error("[sync-worker] finance sync failed", {
            channelId,
            channelType: channel.channelType,
            batch: financeBatches,
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

      if (handler.syncOrderFinances) {
        let shouldContinueFinance = orderSyncSavedOrders || financeTotals.checked >= BACKGROUND_FINANCE_SYNC_LIMIT;
        while (
          shouldContinueFinance &&
          financeBatches < MAX_FINANCE_BATCHES_PER_WORKER &&
          remainingTimeMs() > minFinanceBatchBudgetMs
        ) {
          try {
            shouldContinueFinance = await runFinanceBatch(orderSyncSavedOrders ? "post_order" : "backlog");
            orderSyncSavedOrders = false;
          } catch (err) {
            logger.error("[sync-worker] finance continuation failed", {
              channelId,
              channelType: channel.channelType,
              batch: financeBatches,
              remainingTimeMs: remainingTimeMs(),
              error: err,
            });
            shouldContinueFinance = false;
          }
        }

        if (shouldContinueFinance) {
          logger.info("[sync-worker] finance backlog deferred", {
            channelId,
            channelType: channel.channelType,
            financeBatches,
            maxFinanceBatches: MAX_FINANCE_BATCHES_PER_WORKER,
            remainingTimeMs: remainingTimeMs(),
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

      logger.info("[sync-worker] background work completed", {
        channelId,
        financeOnly,
        financeBatches,
        externalFinanceChecks: financeTotals.checked,
        financeSynced: financeTotals.synced,
        financeNoData: financeTotals.noData,
        financeFailed: financeTotals.failed,
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
