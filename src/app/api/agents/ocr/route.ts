import { db } from "@/db";
import { settings } from "@/db/schema";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { runOcrAgent } from "@/lib/agents/ocr-agent";
import { eq } from "drizzle-orm";

export const maxDuration = 60; // Vercel Hobby max — Gemini PDF extraction can take 15–30s

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  // 1. Check if the agent is enabled via platform settings (falls back to registry default)
  const [setting] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "agent:invoice_ocr:isActive"));

  const isEnabled = setting !== undefined
    ? (setting.value as boolean)
    : AGENT_REGISTRY.invoice_ocr.enabled;

  if (!isEnabled) {
    return Response.json(
      { error: "AI Invoice Extractor is currently disabled." },
      { status: 503 }
    );
  }

  // 2. Check for the required API key configuration
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      { error: "Gemini API key not configured. Add GOOGLE_GENERATIVE_AI_API_KEY to your environment." },
      { status: 503 }
    );
  }

  try {
    // 3. Parse multipart FormData — avoids base64 overhead and JSON body size limits
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file uploaded." }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return Response.json(
        { error: "Unsupported file type. Please upload a PDF, JPEG, PNG, or WebP." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: "File too large. Maximum size is 10 MB." },
        { status: 400 }
      );
    }

    // 4. Convert File → Buffer and pass raw bytes to the agent
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const result = await runOcrAgent(fileBuffer, file.type);
    return Response.json(result);
  } catch (err) {
    console.error("[agent/ocr]", { error: String(err) });
    return Response.json(
      { error: "Failed to extract data or save draft. Please try again." },
      { status: 500 }
    );
  }
}
