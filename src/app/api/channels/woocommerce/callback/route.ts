import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { channels } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { encrypt } from "@/lib/crypto";

// WooCommerce POSTs form-encoded data after user approves the connection:
// consumer_key, consumer_secret, key_permissions, user_id (our internal channelId)
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "none";
  console.log("[woocommerce/callback] POST received", { contentType });

  let channelId: number;
  let consumerKey: string;
  let consumerSecret: string;

  try {
    const rawBody = await request.text();
    console.log("[woocommerce/callback] raw body", { body: rawBody.substring(0, 300) });

    // Parse URL-encoded (WooCommerce default via wp_remote_post with body array)
    const params = new URLSearchParams(rawBody);
    channelId = Number(params.get("user_id"));
    consumerKey = params.get("consumer_key") ?? "";
    consumerSecret = params.get("consumer_secret") ?? "";

    // JSON fallback — some WooCommerce setups send JSON
    if (!channelId && rawBody.trimStart().startsWith("{")) {
      try {
        const json = JSON.parse(rawBody) as Record<string, unknown>;
        channelId = Number(json.user_id);
        consumerKey = String(json.consumer_key ?? "");
        consumerSecret = String(json.consumer_secret ?? "");
      } catch {
        // not valid JSON, stay with URLSearchParams result
      }
    }

    console.log("[woocommerce/callback] parsed fields", {
      channelId,
      hasKey: !!consumerKey,
      hasSecret: !!consumerSecret,
    });
  } catch (err) {
    console.error("[woocommerce/callback] body parse error", { error: String(err) });
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (!channelId || !consumerKey || !consumerSecret) {
    console.error("[woocommerce/callback] missing required fields", {
      channelId,
      hasKey: !!consumerKey,
      hasSecret: !!consumerSecret,
    });
    return new NextResponse("Bad Request", { status: 400 });
  }

  try {
    const updated = await db
      .update(channels)
      .set({
        status: "connected",
        credentials: {
          consumerKey: encrypt(consumerKey),
          consumerSecret: encrypt(consumerSecret),
        },
        updatedAt: new Date(),
      })
      .where(and(eq(channels.id, channelId), eq(channels.status, "pending")))
      .returning({ id: channels.id });

    if (updated.length === 0) {
      // Diagnose why the row didn't match the WHERE clause
      const existing = await db
        .select({ id: channels.id, status: channels.status })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      if (existing.length === 0) {
        console.error("[woocommerce/callback] channel not found in DB", { channelId });
      } else {
        console.error("[woocommerce/callback] channel exists but wrong status", {
          channelId,
          currentStatus: existing[0].status,
        });
      }
      return new NextResponse("Not Found", { status: 404 });
    }

    console.log("[woocommerce/callback] connected successfully", { channelId });
  } catch (err) {
    console.error("[woocommerce/callback] db/encrypt error", { channelId, error: String(err) });
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  // WooCommerce requires HTTP 200 — it then redirects the user to return_url itself.
  return new NextResponse(null, { status: 200 });
}
