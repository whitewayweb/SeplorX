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
    // In production on Vercel, relative fetch isn't supported inside route handlers, so we construct absolute URL.
    const url = new URL(request.url);
    const workerUrl = `${url.protocol}//${url.host}/api/agents/sync-worker`;

    // We do NOT await the array array of promises fully, or we await Promise.allSettled if we expect them to be fast.
    // However, invoking them via fetch without awaiting allows Next.js to fire the requests off in the background,
    // though on Vercel this requires `waitUntil` or sending requests out prior to ending the socket.
    // Instead, we await them to ensure edge function doesn't abort requests, but since each worker gets its own 15-60s limit,
    // firing the HTTP requests natively offloads the work to the respective lambda nodes.
    
    // We will await them so the lambda doesn't close sockets prematurely.
    const results = await Promise.allSettled(
      activeChannels.map((channel) =>
        fetch(workerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({ channelId: channel.id }),
        })
      )
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;

    return NextResponse.json({ triggered: activeChannels.length, successfulDispatches: successCount });
  } catch (error) {
    console.error(`[cron/order-sync] Fatal error:`, error);
    return NextResponse.json({ error: "Scheduler failed" }, { status: 500 });
  }
}
