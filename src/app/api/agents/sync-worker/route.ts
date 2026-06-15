import { NextResponse, after } from "next/server";
import { getChannelHandler } from "@/lib/channels/handlers";
import {
  claimOrderSyncChannel,
  isOrderSyncEnabled,
  markOrderSyncSucceeded,
  releaseOrderSyncClaim,
} from "@/lib/agents/order-sync-state";
import { logger } from "@/lib/logger";

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
      if (financeOnly) {
        return NextResponse.json({ skipped: true, reason: "Finance auto sync is disabled" }, { status: 202 });
      }

      logger.info("request received", {
        component: "sync-worker",
        channelId,
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
            let orderSyncSucceeded = false;
            let orderSyncClaimFinalized = false;

            if (handler.fetchAndSaveOrders) {
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
                    try {
                      await markOrderSyncSucceeded(channel.id);
                      orderSyncClaimFinalized = true;
                    } catch (err) {
                      logger.error("failed to mark order sync succeeded", {
                        component: "sync-worker",
                        channelId,
                        financeOnly,
                        channelType: channel.channelType,
                        error: err,
                      });
                    }

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



            try {
              if (!orderSyncClaimFinalized) {
                if (orderSyncSucceeded) {
                  await markOrderSyncSucceeded(channel.id);
                } else {
                  await releaseOrderSyncClaim(channel.id);
                }
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
              channelType: channel.channelType,
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
