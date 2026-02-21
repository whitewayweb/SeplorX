import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { channels } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { encrypt } from "@/lib/crypto";

// WooCommerce POSTs form-encoded data after user approves the connection:
// consumer_key, consumer_secret, key_permissions, user_id (our internal channelId)
export async function POST(request: NextRequest) {
  let channelId: number;
  let consumerKey: string;
  let consumerSecret: string;

  try {
    const body = await request.formData();
    channelId = Number(body.get("user_id"));
    consumerKey = String(body.get("consumer_key") ?? "");
    consumerSecret = String(body.get("consumer_secret") ?? "");
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (!channelId || !consumerKey || !consumerSecret) {
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
      return new NextResponse("Not Found", { status: 404 });
    }
  } catch (err) {
    console.error("[woocommerce/callback]", { channelId, error: String(err) });
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  // WooCommerce requires HTTP 200 — it then redirects the user to return_url itself.
  return new NextResponse(null, { status: 200 });
}
