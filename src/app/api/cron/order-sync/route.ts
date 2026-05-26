import { NextResponse } from "next/server";
import { db } from "@/db";
import { channels } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { isOrderSyncEnabled } from "@/lib/agents/order-sync-state";
import { getBaseUrl } from "@/lib/utils";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}

async function handleRequest(request: Request) {
  try {
    return await logger.measure("agent/sync-scheduler", { component: "agent/sync-scheduler" }, async () => {
      // 1. Authorization
      const authHeader = request.headers.get("authorization");
      const isVercelCron = request.headers.get("x-vercel-cron") === "1";

      if (authHeader !== `Bearer ${process.env.CRON_JOB_KEY}` && !isVercelCron) {
        return new NextResponse("Unauthorized", { status: 401 });
      }

      // 2. Settings check
      if (!(await isOrderSyncEnabled())) {
        return NextResponse.json({ error: "Order Sync agent is disabled." }, { status: 503 });
      }

      // 3. Fetch active channels (Support optional userId filtering for On-Demand sync)
      const queryUrl = new URL(request.url);
      const userIdParam = queryUrl.searchParams.get("userId");

      const activeChannels = await db
        .select({ id: channels.id })
        .from(channels)
        .where(
          and(
            eq(channels.status, "connected"),
            userIdParam ? eq(channels.userId, Number(userIdParam)) : undefined
          )
        );

      if (activeChannels.length === 0) {
        logger.info("no active channels", {
          component: "agent/sync-scheduler",
          userIdFiltered: Boolean(userIdParam),
        });
        return NextResponse.json({ triggered: 0, reason: "No active channels found" });
      }

      // 4. Dispatch Workers (Fan-Out)
      const baseUrl = getBaseUrl(request.headers);
      const workerUrl = `${baseUrl}/api/agents/sync-worker`;

      logger.info("dispatching workers", {
        component: "agent/sync-scheduler",
        workerCount: activeChannels.length,
        userIdFiltered: Boolean(userIdParam),
      });

      const results = await Promise.allSettled(
        activeChannels.map((channel) =>
          fetch(workerUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.CRON_JOB_KEY}`,
              "x-vercel-cron": request.headers.get("x-vercel-cron") || "0",
            },
            body: JSON.stringify({ channelId: channel.id }),
            cache: "no-store",
          })
        )
      );

      const stats = {
        triggered: activeChannels.length,
        ok: 0,
        failed: 0,
        failedStatuses: [] as { channelId: number; status: number }[],
      };

      results.forEach((result, idx) => {
        const channelId = activeChannels[idx].id;
        if (result.status === "fulfilled" && result.value.ok) {
          stats.ok++;
        } else {
          stats.failed++;
          stats.failedStatuses.push({
            channelId,
            status: result.status === "fulfilled" ? result.value.status : 500,
          });
        }
      });

      logger.info("dispatch completed", {
        component: "agent/sync-scheduler",
        ...stats,
      });

      return NextResponse.json(stats);
    });
  } catch (error) {
    logger.error("fatal error", {
      component: "agent/sync-scheduler",
      error,
    });
    return NextResponse.json({ error: "Scheduler failed" }, { status: 500 });
  }
}
