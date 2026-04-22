import { NextResponse } from "next/server";
import { db } from "@/db";
import { channels, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AGENT_REGISTRY } from "@/lib/agents/registry";

export async function GET(request: Request) {
  try {
    // 1. Authorization
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_JOB_KEY}`) {
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

    // 3. Fetch active channels
    const activeChannels = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.status, "connected"));

    if (activeChannels.length === 0) {
      return NextResponse.json({ triggered: 0, reason: "No active channels" });
    }

    // 4. Dispatch Workers (Fan-Out)
    const url = new URL(request.url);
    const workerUrl = `${url.protocol}//${url.host}/api/agents/sync-worker`;

    const results = await Promise.allSettled(
      activeChannels.map((channel) =>
        fetch(workerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.CRON_JOB_KEY}`,
          },
          body: JSON.stringify({ channelId: channel.id }),
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
    console.error(`[cron/order-sync] Fatal error:`, error);
    return NextResponse.json({ error: "Scheduler failed" }, { status: 500 });
  }
}
