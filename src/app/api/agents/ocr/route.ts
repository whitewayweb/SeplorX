import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { runOcrAgent } from "@/lib/agents/ocr-agent";

export const maxDuration = 10; // 10 seconds timeout for Vercel Free Tier (Hobby)

export async function POST(req: Request) {
  // 1. Check if the agent is enabled in the registry
  if (!AGENT_REGISTRY.invoice_ocr.enabled) {
    return Response.json(
      { error: "AI Invoice Extractor is currently disabled." }, 
      { status: 503 }
    );
  }

  // 2. Check for the required configuration
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      { error: "Gemini API key not configured. Add GOOGLE_GENERATIVE_AI_API_KEY to your environment." },
      { status: 503 }
    );
  }

  try {
    const { base64File, mimeType } = await req.json();

    if (!base64File || !mimeType) {
      return Response.json(
        { error: "Missing file data (base64File or mimeType)." },
        { status: 400 }
      );
    }

    // 3. Execute the Agent Action
    const result = await runOcrAgent(base64File, mimeType);
    
    // We return the taskId so the frontend can redirect to the approval page
    return Response.json(result);
    
  } catch (err) {
    console.error("[agent/ocr]", { error: String(err) });
    return Response.json(
      { error: "Failed to extract data or save draft. Please try again." }, 
      { status: 500 }
    );
  }
}
