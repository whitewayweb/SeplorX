import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { channels, salesOrders, salesOrderItems, channelProductMappings, products } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { getChannelHandler } from "@/lib/channels/handlers";
import { processOrderStockChange } from "@/lib/stock/service";
import type { SalesOrderStatus } from "@/db/schema";

/**
 * Generic webhook receiver for channel order events.
 * URL: POST /api/channels/{type}/webhook/{channelId}
 *
 * Phase 2: Uses parseWebhookOrder() to upsert the order and feed status
 * transitions into processOrderStockChange(). Falls back to legacy
 * processWebhook() for backward compatibility if parseWebhookOrder is
 * not available.
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

  // Read raw body and headers before any async work
  const body = await request.text();
  const signature = request.headers.get("x-wc-webhook-signature") ?? "";
  const topic = request.headers.get("x-wc-webhook-topic") ?? "";

  // Fetch channel row — verify existence and get encrypted webhookSecret
  const channelRows = await db
    .select({
      id: channels.id,
      userId: channels.userId,
      credentials: channels.credentials,
      status: channels.status,
    })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);

  if (channelRows.length === 0 || channelRows[0].status !== "connected") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { credentials, userId } = channelRows[0];

  // ── Defense-in-depth: validate encrypted URL signature ────────────────────
  // During registration, encrypt(channelId) is appended as ?sig= to the URL.
  // If sig is present, we decrypt it and verify it matches the path channelId.
  // Backward compatible: channels registered before this feature have no sig.
  const sig = request.nextUrl.searchParams.get("sig");
  if (sig) {
    try {
      const decryptedId = decrypt(decodeURIComponent(sig));
      if (decryptedId !== String(channelId)) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    } catch {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

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

  if (!handler.capabilities?.usesWebhooks) {
    return new NextResponse("Webhook not supported", { status: 400 });
  }

  // ─── New path: order-status-driven stock via parseWebhookOrder() ────────
  // For order.created, order.updated, order.cancelled — upsert the order
  // and call processOrderStockChange() for proper reservation handling.
  const isOrderTopic = topic.startsWith("order.");

  if (isOrderTopic && handler.parseWebhookOrder) {
    try {
      const orderEvent = handler.parseWebhookOrder(body, signature, secret);
      if (!orderEvent) {
        return new NextResponse(null, { status: 200 }); // Unparseable — ack
      }

      const newStatus = orderEvent.status as SalesOrderStatus;

      // Upsert the sales order
      const [existingOrder] = await db
        .select({
          id: salesOrders.id,
          status: salesOrders.status,
        })
        .from(salesOrders)
        .where(
          and(
            eq(salesOrders.channelId, channelId),
            eq(salesOrders.externalOrderId, orderEvent.externalOrderId),
          ),
        )
        .limit(1);

      if (existingOrder) {
        // Order exists — update status and process stock transition
        const oldStatus = existingOrder.status;

        if (oldStatus !== newStatus) {
          await db
            .update(salesOrders)
            .set({
              previousStatus: oldStatus,
              status: newStatus,
              rawData: orderEvent.rawData,
            })
            .where(eq(salesOrders.id, existingOrder.id));

          await processOrderStockChange(
            existingOrder.id,
            newStatus,
            oldStatus,
            userId,
          );
        }
      } else {
        // New order — insert order + items, then process stock
        await db.transaction(async (tx) => {
          const [insertedOrder] = await tx.insert(salesOrders).values({
            channelId,
            externalOrderId: orderEvent.externalOrderId,
            status: newStatus,
            totalAmount: orderEvent.totalAmount,
            currency: orderEvent.currency,
            buyerName: orderEvent.buyerName,
            buyerEmail: orderEvent.buyerEmail,
            purchasedAt: orderEvent.purchasedAt,
            rawData: orderEvent.rawData,
          }).returning({ id: salesOrders.id });

          for (const item of orderEvent.lineItems) {
            // Try to find the SeplorX product
            let matchedProductId: number | undefined;

            if (item.externalProductId && item.externalProductId !== "0") {
              const [mapping] = await tx
                .select({ productId: channelProductMappings.productId })
                .from(channelProductMappings)
                .where(
                  and(
                    eq(channelProductMappings.channelId, channelId),
                    eq(channelProductMappings.externalProductId, item.externalProductId),
                  ),
                )
                .limit(1);
              matchedProductId = mapping?.productId;
            }

            if (!matchedProductId && item.sku) {
              const [localProduct] = await tx
                .select({ id: products.id })
                .from(products)
                .where(eq(products.sku, item.sku))
                .limit(1);
              if (localProduct) matchedProductId = localProduct.id;
            }

            await tx.insert(salesOrderItems).values({
              orderId: insertedOrder.id,
              externalItemId: item.externalProductId,
              productId: matchedProductId,
              sku: item.sku || null,
              title: item.title || null,
              quantity: item.quantity,
              price: item.price || null,
              rawData: item.rawData,
            });
          }
        });

        // Process stock for the new order (outside tx for isolation)
        const [savedOrder] = await db
          .select({ id: salesOrders.id })
          .from(salesOrders)
          .where(
            and(
              eq(salesOrders.channelId, channelId),
              eq(salesOrders.externalOrderId, orderEvent.externalOrderId),
            ),
          )
          .limit(1);

        if (savedOrder) {
          await processOrderStockChange(
            savedOrder.id,
            newStatus,
            null,
            userId,
          );
        }
      }

      return new NextResponse(null, { status: 200 });
    } catch (err) {
      console.error("[channels/webhook] order processing error", {
        type, channelId, topic, error: String(err),
      });
      // Return 200 to prevent retry storms from WooCommerce
      return new NextResponse(null, { status: 200 });
    }
  }

  // ─── Legacy path: for non-order topics or handlers without parseWebhookOrder ─
  if (!handler.processWebhook) {
    return new NextResponse("Webhook not supported", { status: 400 });
  }

  let changes;
  try {
    changes = handler.processWebhook(body, signature, topic, secret);
  } catch (err) {
    console.error("[channels/webhook] processWebhook error", { type, channelId, topic, error: String(err) });
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (changes.length === 0) {
    return new NextResponse(null, { status: 200 });
  }

  // Legacy stock change path (kept for backward compatibility)
  const { inventoryTransactions } = await import("@/db/schema");
  const { sql } = await import("drizzle-orm");

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
      console.warn("[channels/webhook] unmapped product skipped", {
        type, channelId, externalProductId: change.externalProductId,
      });
      continue;
    }

    const productId = mapping[0].productId;

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

    if (existing.length > 0) continue;

    try {
      await db.transaction(async (tx) => {
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
          createdBy: userId,
          notes: `Auto-synced from ${type} webhook (order ${change.referenceId})`,
        });
      });
    } catch (err) {
      console.error("[channels/webhook] stock update error", {
        type, channelId, productId, error: String(err),
      });
    }
  }

  return new NextResponse(null, { status: 200 });
}
