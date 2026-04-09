import { after } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { runChannelMappingAgent } from "@/lib/agents/channel-mapping-agent";
import { getChannelById } from "@/lib/channels/registry";
import { getChannelForAgent } from "@/lib/channels/queries";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function POST(request: Request) {
  const [setting] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "agent:channelMapping:isActive"));

  const isEnabled =
    setting !== undefined
      ? (setting.value as boolean)
      : AGENT_REGISTRY.channelMapping.enabled;

  if (!isEnabled) {
    return Response.json({ error: "Channel Mapping agent is disabled." }, { status: 503 });
  }

  // At least one AI provider must be configured
  if (!process.env.OPENROUTER_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      { error: "No AI provider configured. Add OPENROUTER_KEY or GOOGLE_GENERATIVE_AI_API_KEY to your environment." },
      { status: 503 },
    );
  }

  let channelId: number;
  try {
    const body = await request.json();
    channelId = Number(body?.channelId);
    if (!channelId || isNaN(channelId)) {
      return Response.json({ error: "Invalid channelId." }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Guard: verify the channel exists, is connected, and supports product fetching.
  const channelRow = await getChannelForAgent(channelId);

  if (!channelRow) {
    return Response.json({ error: "Channel not found." }, { status: 404 });
  }
  if (channelRow.status !== "connected") {
    return Response.json({ error: "Channel is not connected." }, { status: 400 });
  }
  const def = getChannelById(channelRow.channelType as Parameters<typeof getChannelById>[0]);
  if (!def?.capabilities?.canFetchProducts) {
    return Response.json({ error: "This channel type does not support product fetching." }, { status: 400 });
  }

  // Extract userId before passing to after() since headers() are lost in background
  const userId = await getAuthenticatedUserId();

  // Run agent in background via after() — respond immediately
  after(async () => {
    try {
      console.log(`[agent/channel-mapping] Starting background run for channel ${channelId}`);
      const result = await runChannelMappingAgent(channelId, userId);
      if ("error" in result) {
        console.error("[agent/channel-mapping] Background error:", result.error);
      } else if ("taskId" in result) {
        console.log("[agent/channel-mapping] Proposals saved, taskId:", result.taskId);
      } else if ("message" in result) {
        console.log("[agent/channel-mapping]", result.message);
      }
    } catch (err) {
      console.error("[agent/channel-mapping] Background exception:", String(err));
    }
  });

  return Response.json({
    status: "processing",
    message: "Mapping started — AI is analyzing products in the background. Refresh the page in a moment to see proposals.",
  });
}
