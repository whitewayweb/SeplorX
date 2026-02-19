import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { runReorderAgent } from "@/lib/agents/reorder-agent";

export async function POST() {
  if (!AGENT_REGISTRY.reorder.enabled) {
    return Response.json({ error: "Reorder agent is disabled." }, { status: 503 });
  }

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      { error: "Gemini API key not configured. Add GOOGLE_GENERATIVE_AI_API_KEY to your environment." },
      { status: 503 },
    );
  }

  try {
    const result = await runReorderAgent();
    return Response.json(result);
  } catch (err) {
    console.error("[agent/reorder]", { error: String(err) });
    return Response.json({ error: "Agent failed. Please try again." }, { status: 500 });
  }
}
