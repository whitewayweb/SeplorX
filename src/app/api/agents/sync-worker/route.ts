import { NextResponse, after } from "next/server";
import { getChannelHandler } from "@/lib/channels/handlers";
import {
  claimOrderSyncChannel,
  isOrderSyncEnabled,
  markOrderSyncSucceeded,
  releaseOrderSyncClaim,
} from "@/lib/agents/order-sync-state";

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

    // 4. Atomically claim the channel. This prevents concurrent scheduler
    // invocations from starting duplicate workers for the same channel while
    // still allowing retry after a stale claim timeout.
    const channel = await claimOrderSyncChannel(channelId);

    if (!channel) {
      return NextResponse.json({ skipped: true, reason: "Channel is disconnected or already syncing" }, { status: 202 });
    }

    // 5. Execute Handler (Fire-and-forget in background)
    const handler = getChannelHandler(channel.channelType);
    if (!handler?.fetchAndSaveOrders) {
      await releaseOrderSyncClaim(channel.id);
      return NextResponse.json({ skipped: true, reason: "Handler does not support fetchAndSaveOrders" });
    }

    // Use after() introduced in Next.js 15+ to run the heavy work after response is sent
    after(async () => {
      const startTime = Date.now();
      try {
        console.log(`[sync-worker] [${channelId}] Starting background sync for channel "${channel.name}"`);
        const result = await handler.fetchAndSaveOrders!(channel.userId, channel.id);
        
        // Update the last_order_sync_at cursor on success
        await markOrderSyncSucceeded(channel.id);
          
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
