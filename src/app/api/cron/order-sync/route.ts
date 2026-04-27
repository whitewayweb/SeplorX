import { NextResponse } from "next/server";
import { db } from "@/db";
import { channels, settings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { getBaseUrl } from "@/lib/utils";

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}

async function handleRequest(request: Request) {
  try {
    // 1. Authorization
    const authHeader = request.headers.get("authorization");
    const isVercelCron = request.headers.get("x-vercel-cron") === "1";

    if (authHeader !== `Bearer ${process.env.CRON_JOB_KEY}` && !isVercelCron) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Settings check
    const [setting] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "agent:orderSync:isActive"));

    const isEnabled = setting !== undefined ? (setting.value as boolean) : AGENT_REGISTRY.orderSync.enabled;

    if (!isEnabled) {
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
      return NextResponse.json({ triggered: 0, reason: "No active channels found" });
    }

    // 4. Dispatch Workers (Fan-Out)
    const baseUrl = getBaseUrl(request.headers);
    const workerUrl = `${baseUrl}/api/agents/sync-worker`;

    console.log(`[agent/sync-scheduler] Dispatching ${activeChannels.length} workers to ${workerUrl}`);

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

    return NextResponse.json(stats);
  } catch (error) {
    console.error(`[agent/sync-scheduler] Fatal error:`, error);
    return NextResponse.json({ error: "Scheduler failed" }, { status: 500 });
  }
}
