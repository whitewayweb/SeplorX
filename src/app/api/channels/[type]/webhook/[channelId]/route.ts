import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { channels, channelProductMappings, products, inventoryTransactions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { getChannelHandler } from "@/lib/channels/registry";

const CURRENT_USER_ID = 1;

/**
 * Generic webhook receiver for channel order events.
 * URL: POST /api/channels/{type}/webhook/{channelId}
 *
 * Each connected channel has its own URL (channelId in path) so we know
 * which store's webhookSecret to use for signature verification.
 *
 * WooCommerce (and future channels): must respond 200 quickly or the
 * delivery is marked as failed and retried.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; channelId: string }> },
) {
  const { type, channelId: rawChannelId } = await params;
  const channelId = Number(rawChannelId);

  if (!channelId || isNaN(channelId)) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const handler = getChannelHandler(type);
  if (!handler) {
    return new NextResponse("Unknown channel type", { status: 404 });
  }

  // Read raw body and topic header before any async work
  const body = await request.text();
  const signature = request.headers.get("x-wc-webhook-signature") ?? "";
  const topic = request.headers.get("x-wc-webhook-topic") ?? "";

  // Fetch channel row — verify ownership and get encrypted webhookSecret
  const channelRows = await db
    .select({
      id: channels.id,
      credentials: channels.credentials,
      status: channels.status,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, CURRENT_USER_ID)))
    .limit(1);

  if (channelRows.length === 0 || channelRows[0].status !== "connected") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { credentials } = channelRows[0];
  const encryptedSecret = credentials?.webhookSecret;
  if (!encryptedSecret) {
    console.error("[channels/webhook] webhookSecret not set", { type, channelId });
    return new NextResponse("Webhook not configured", { status: 422 });
  }

  let secret: string;
  try {
    secret = decrypt(encryptedSecret);
  } catch (err) {
    console.error("[channels/webhook] failed to decrypt webhookSecret", { type, channelId, error: String(err) });
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  // Parse + verify webhook — handler verifies HMAC and returns stock changes
  let changes;
  try {
    changes = handler.processWebhook(body, signature, topic, secret);
  } catch (err) {
    // Signature mismatch or parse failure
    console.error("[channels/webhook] processWebhook error", { type, channelId, topic, error: String(err) });
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (changes.length === 0) {
    // Unknown/no-op topic — acknowledge without action
    return new NextResponse(null, { status: 200 });
  }

  // Apply each stock change in SeplorX
  for (const change of changes) {
    const mapping = await db
      .select({ productId: channelProductMappings.productId })
      .from(channelProductMappings)
      .where(
        and(
          eq(channelProductMappings.channelId, channelId),
          eq(channelProductMappings.externalProductId, change.externalProductId),
        ),
      )
      .limit(1);

    if (mapping.length === 0) {
      // Product not mapped in SeplorX — log for operator visibility and skip
      console.warn("[channels/webhook] unmapped product skipped", {
        type,
        channelId,
        externalProductId: change.externalProductId,
        referenceId: change.referenceId,
      });
      continue;
    }

    const productId = mapping[0].productId;

    // Idempotency: skip if we've already processed this order for this product
    const existing = await db
      .select({ id: inventoryTransactions.id })
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.productId, productId),
          eq(inventoryTransactions.referenceType, change.referenceType),
          eq(inventoryTransactions.referenceId, change.referenceId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      continue; // already processed — idempotent
    }

    try {
      await db.transaction(async (tx) => {
        // Atomic GREATEST(0, qty + change) — prevents stock going negative even
        // if two webhooks land concurrently under READ COMMITTED isolation.
        const [updated] = await tx
          .update(products)
          .set({
            quantityOnHand: sql`GREATEST(0, ${products.quantityOnHand} + ${change.quantity})`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, productId))
          .returning({ newQty: products.quantityOnHand });

        if (!updated) return;

        await tx.insert(inventoryTransactions).values({
          productId,
          type: change.type,
          quantity: change.quantity,
          referenceType: change.referenceType,
          referenceId: change.referenceId,
          createdBy: CURRENT_USER_ID,
          notes: `Auto-synced from ${type} webhook (order ${change.referenceId})`,
        });
      });
    } catch (err) {
      console.error("[channels/webhook] stock update error", {
        type,
        channelId,
        productId,
        referenceId: change.referenceId,
        error: String(err),
      });
      // Don't abort — try remaining changes and still return 200
      // to prevent WooCommerce from retrying the entire webhook
    }
  }

  return new NextResponse(null, { status: 200 });
}
