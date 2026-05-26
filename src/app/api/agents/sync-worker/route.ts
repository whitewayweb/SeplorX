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
  try {
    return await logger.measure("sync-worker request", { component: "sync-worker" }, async () => {
      // 1. Authorization
      const authHeader = request.headers.get("authorization");
      const isVercelCron = request.headers.get("x-vercel-cron") === "1";

      if (authHeader !== `Bearer ${process.env.CRON_JOB_KEY}` && !isVercelCron) {
        logger.warn("unauthorized trigger", {
          component: "sync-worker",
          isVercelCron,
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

      logger.info("request received", {
        component: "sync-worker",
        channelId,
        financeOnly,
      });

      // 4. Atomically claim the channel. This prevents concurrent scheduler
      // invocations from starting duplicate workers for the same channel while
      // still allowing retry after a stale claim timeout.
      const channel = await claimOrderSyncChannel(channelId);

      if (!channel) {
        logger.info("claim skipped", {
          component: "sync-worker",
          channelId,
          financeOnly,
          reason: "Channel is disconnected or already syncing",
        });
        return NextResponse.json({ skipped: true, reason: "Channel is disconnected or already syncing" }, { status: 202 });
      }

      // 5. Execute Handler (Fire-and-forget in background)
      const handler = getChannelHandler(channel.channelType);
      if (!handler?.fetchAndSaveOrders && !handler?.syncOrderFinances) {
        await releaseOrderSyncClaim(channel.id);
        logger.info("unsupported channel handler", {
          component: "sync-worker",
          channelId,
          financeOnly,
          channelType: channel.channelType,
        });
        return NextResponse.json({ skipped: true, reason: "Handler does not support order or finance sync" });
      }

      after(async () =>
        logger.measure(
          "sync-worker background work",
          {
            component: "sync-worker",
            channelId,
            financeOnly,
            channelType: channel.channelType,
          },
          async () => {
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
              const syncOrderFinances = handler.syncOrderFinances;
              if (!syncOrderFinances) return false;

              financeBatches++;
              return logger.measure(
                "finance sync",
                {
                  component: "sync-worker",
                  channelId,
                  financeOnly,
                  channelType: channel.channelType,
                  batch: financeBatches,
                  reason,
                },
                async () => {
                  logger.info("finance sync starting", {
                    component: "sync-worker",
                    channelId,
                    financeOnly,
                    channelType: channel.channelType,
                    batch: financeBatches,
                    reason,
                    limit: BACKGROUND_FINANCE_SYNC_LIMIT,
                    retryFailed: true,
                  });

                  const result = await syncOrderFinances(channel.userId, channel.id, {
                    limit: BACKGROUND_FINANCE_SYNC_LIMIT,
                    retryFailed: true,
                  });

                  financeTotals.checked += result.checked;
                  financeTotals.synced += result.synced;
                  financeTotals.noData += result.noData;
                  financeTotals.failed += result.failed;
                  financeTotals.notSupported += result.notSupported;

                  logger.info("finance sync completed", {
                    component: "sync-worker",
                    channelId,
                    financeOnly,
                    channelType: channel.channelType,
                    batch: financeBatches,
                    reason,
                    externalFinanceChecks: result.checked,
                    synced: result.synced,
                    noData: result.noData,
                    failed: result.failed,
                    notSupported: result.notSupported,
                  });

                  return result.checked >= BACKGROUND_FINANCE_SYNC_LIMIT;
                }
              );
            };

            if (handler.syncOrderFinances) {
              try {
                await runFinanceBatch("initial");
              } catch (err) {
                logger.error("finance sync failed", {
                  component: "sync-worker",
                  channelId,
                  financeOnly,
                  channelType: channel.channelType,
                  batch: financeBatches,
                  error: err,
                });
              }
            }

            if (!financeOnly && handler.fetchAndSaveOrders) {
              const fetchAndSaveOrders = handler.fetchAndSaveOrders;
              try {
                await logger.measure(
                  "order sync",
                  {
                    component: "sync-worker",
                    channelId,
                    financeOnly,
                    channelType: channel.channelType,
                  },
                  async () => {
                    logger.info("order sync starting", {
                      component: "sync-worker",
                      channelId,
                      financeOnly,
                      channelType: channel.channelType,
                    });
                    const result = await fetchAndSaveOrders(channel.userId, channel.id);
                    orderSyncSucceeded = true;
                    orderSyncSavedOrders = result.saved > 0;

                    logger.info("order sync completed", {
                      component: "sync-worker",
                      channelId,
                      financeOnly,
                      channelType: channel.channelType,
                      externalOrdersFetched: result.fetched,
                      ordersSaved: result.saved,
                    });
                  }
                );
              } catch (err) {
                logger.error("order sync failed", {
                  component: "sync-worker",
                  channelId,
                  financeOnly,
                  channelType: channel.channelType,
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
                  logger.error("finance continuation failed", {
                    component: "sync-worker",
                    channelId,
                    financeOnly,
                    channelType: channel.channelType,
                    batch: financeBatches,
                    remainingTimeMs: remainingTimeMs(),
                    error: err,
                  });
                  shouldContinueFinance = false;
                }
              }

              if (shouldContinueFinance) {
                logger.info("finance backlog deferred", {
                  component: "sync-worker",
                  channelId,
                  financeOnly,
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
              logger.error("failed to finalize sync claim", {
                component: "sync-worker",
                channelId,
                financeOnly,
                channelType: channel.channelType,
                error: err,
              });
            }

            logger.info("background work completed", {
              component: "sync-worker",
              channelId,
              financeOnly,
              channelType: channel.channelType,
              financeBatches,
              externalFinanceChecks: financeTotals.checked,
              financeSynced: financeTotals.synced,
              financeNoData: financeTotals.noData,
              financeFailed: financeTotals.failed,
            });
          }
        )
      );

      logger.info("accepted", {
        component: "sync-worker",
        channelId,
        financeOnly,
      });
      return NextResponse.json({ success: true, message: "Sync triggered in background" }, { status: 202 });
    });
  } catch (error) {
    logger.error("fatal error parsing request", {
      component: "sync-worker",
      error,
    });
    return NextResponse.json({ error: "Worker failed" }, { status: 500 });
  }
}
