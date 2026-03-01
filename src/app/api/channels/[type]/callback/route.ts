import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { channels } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { encrypt } from "@/lib/crypto";
import { getChannelHandler } from "@/lib/channels/handlers";

/**
 * Generic OAuth callback — WooCommerce (and future channels) POST credentials here.
 * The channel type in the URL selects which handler parses the body.
 * WooCommerce requires HTTP 200; it then redirects the user to return_url itself.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;

  const handler = getChannelHandler(type);
  if (!handler) {
    return new NextResponse("Unknown channel type", { status: 404 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error("[channels/callback] body read error", { type, error: String(err) });
    return new NextResponse("Bad Request", { status: 400 });
  }

  const parsed = handler.parseCallback(rawBody);
  if (!parsed) {
    console.error("[channels/callback] invalid callback body", { type });
    return new NextResponse("Bad Request", { status: 400 });
  }

  const { channelId, credentials } = parsed;

  // Encrypt all credential values before storing
  const encryptedCredentials: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    encryptedCredentials[key] = encrypt(value);
  }

  try {
    const updated = await db
      .update(channels)
      .set({
        status: "connected",
        credentials: encryptedCredentials,
        updatedAt: new Date(),
      })
      .where(and(eq(channels.id, channelId), eq(channels.status, "pending")))
      .returning({ id: channels.id });

    if (updated.length === 0) {
      // Diagnose whether the channel exists at all vs wrong status
      const existing = await db
        .select({ id: channels.id, status: channels.status })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      if (existing.length === 0) {
        console.error("[channels/callback] channel not found in DB", { type, channelId });
      } else {
        console.error("[channels/callback] channel exists but wrong status", {
          type,
          channelId,
          currentStatus: existing[0].status,
        });
      }
      return new NextResponse("Not Found", { status: 404 });
    }
  } catch (err) {
    console.error("[channels/callback] db/encrypt error", { type, channelId, error: String(err) });
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  // Return 200 — the channel protocol (e.g. WooCommerce) redirects user to return_url itself.
  return new NextResponse(null, { status: 200 });
}
