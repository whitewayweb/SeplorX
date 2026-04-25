import { NextResponse, after } from "next/server";
import { db } from "@/db";
import { channels, settings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getChannelHandler } from "@/lib/channels/handlers";
import { AGENT_REGISTRY } from "@/lib/agents/registry";

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
    const [setting] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "agent:orderSync:isActive"));

    const isEnabled = setting !== undefined ? (setting.value as boolean) : AGENT_REGISTRY.orderSync.enabled;

    if (!isEnabled) {
      return NextResponse.json({ error: "Order Sync agent is disabled." }, { status: 503 });
    }

    // 3. Payload
    const body = await request.json().catch(() => ({}));
    if (!body.channelId) {
      return NextResponse.json({ error: "Missing channelId" }, { status: 400 });
    }

    const channelId = Number(body.channelId);

    // 4. Retrieve Channel
    const [channel] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.status, "connected")))
      .limit(1);

    if (!channel) {
      return NextResponse.json({ error: "Connected channel not found" }, { status: 404 });
    }

    // 5. Execute Handler (Fire-and-forget in background)
    const handler = getChannelHandler(channel.channelType);
    if (!handler?.fetchAndSaveOrders) {
      return NextResponse.json({ skipped: true, reason: "Handler does not support fetchAndSaveOrders" });
    }

    // Use after() introduced in Next.js 15+ to run the heavy work after response is sent
    after(async () => {
      const startTime = Date.now();
      try {
        console.log(`[sync-worker] [${channelId}] Starting background sync for channel "${channel.name}"`);
        const result = await handler.fetchAndSaveOrders!(channel.userId, channel.id);
        
        // Update the last_order_sync_at cursor on success
        await db.update(channels)
          .set({ lastOrderSyncAt: new Date() })
          .where(eq(channels.id, channel.id));
          
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[sync-worker] [${channelId}] Success: fetched ${result.fetched}, saved ${result.saved} orders. Duration: ${duration}s`);
      } catch (err) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`[sync-worker] [${channelId}] Background sync failed after ${duration}s:`, err);
      }
    });

    return NextResponse.json({ success: true, message: "Sync triggered in background" }, { status: 202 });
  } catch (error) {
    console.error(`[agent/sync-worker] Fatal error parsing request:`, error);
    return NextResponse.json({ error: "Worker failed" }, { status: 500 });
  }
}

