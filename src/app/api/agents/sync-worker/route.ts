import { NextResponse } from "next/server";
import { db } from "@/db";
import { channels, settings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getChannelHandler } from "@/lib/channels/handlers";
import { AGENT_REGISTRY } from "@/lib/agents/registry";

export async function POST(request: Request) {
  try {
    // 1. Authorization
    const authHeader = request.headers.get("authorization");
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

    // 5. Execute Handler
    const handler = getChannelHandler(channel.channelType);
    if (!handler?.fetchAndSaveOrders) {
      return NextResponse.json({ skipped: true, reason: "Handler does not support fetchAndSaveOrders" });
    }

    const result = await handler.fetchAndSaveOrders(channel.userId, channel.id);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error(`[agent/sync-worker] Fatal error parsing request:`, error);
    return NextResponse.json({ error: "Worker failed" }, { status: 500 });
  }
}
