import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { runChannelMappingAgent } from "@/lib/agents/channel-mapping-agent";
import { getChannelById } from "@/lib/channels/registry";
import { getChannelForAgent } from "@/lib/channels/queries";

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

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      { error: "Gemini API key not configured. Add GOOGLE_GENERATIVE_AI_API_KEY to your environment." },
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
  // This prevents crafted requests from triggering agent failures for unsupported types.
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

  try {
    const result = await runChannelMappingAgent(channelId);
    return Response.json(result);
  } catch (err) {
    console.error("[agent/channel-mapping]", { channelId, error: String(err) });
    return Response.json({ error: "Agent failed. Please try again." }, { status: 500 });
  }
}
