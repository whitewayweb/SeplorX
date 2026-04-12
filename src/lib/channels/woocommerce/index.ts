import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { ChannelHandler, WebhookStockChange, WebhookOrderEvent, ExternalProduct, ChannelPushSyncResult } from "../types";
import { extractSqlField, getBrands } from "./queries";
import { PORTAL_NAME } from "@/utils/constants";

// ─── WooCommerce REST API helpers ─────────────────────────────────────────────
// credentials JSONB keys: consumerKey, consumerSecret (encrypted),
// and after registerWebhooks(): webhookSecret, webhookOrderCreatedId, webhookOrderCancelledId

function basicAuth(consumerKey: string, consumerSecret: string): string {
  return "Basic " + Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
}

async function wcFetch(
  storeUrl: string,
  path: string,
  options: RequestInit,
): Promise<Response> {
  const base = storeUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/wp-json/wc/v3${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
  return res;
}

import { Product as WCProduct } from "./api/types/wcproductSchema";
import { ShopOrder as WCOrderPayload } from "./api/types/wcorderSchema";

import { StandardizedProductRecord } from "../types";

// ─── Scalable Field Mapping ───────────────────────────────────────────────
// Maps standardized SeplorX UI fields to WooCommerce REST API / DB keys.
// This avoids giant switch/case blocks and makes it easy to add new fields.
// Key = SeplorX field, value = WooCommerce field name (keyof WCProduct or meta key).
const FIELD_MAP: Partial<Record<keyof StandardizedProductRecord, keyof WCProduct | string>> = {
  name: "name",
  sku: "sku",
  stockQuantity: "stock_quantity",
  description: "description",
  price: "regular_price",
  itemWeight: "weight",       // Standard attribute for item weight
  pkgWeight: "pkg_weight",   // Use a distinct key to prevent collision with itemWeight
  brand: "brand-name",
  itemCondition: "item-condition",
  manufacturer: "manufacturer",
  partNumber: "part_number",
  color: "color",
};

// ─── Handler ──────────────────────────────────────────────────────────────────

import {
  configFields,
  capabilities,
  validateConfig,
  buildConnectUrl,
  extractProductFields,
} from "./config";

export const woocommerceHandler: ChannelHandler = {
  id: "woocommerce",
  configFields,
  capabilities,
  // Topics registered as webhooks on the remote WooCommerce store.
  // order.created = new order, order.updated = any status change (incl. cancellation).
  // Note: WooCommerce has no 'order.cancelled' topic — cancellations arrive via order.updated.
  webhookTopics: ["order.created", "order.updated"] as const,

  validateConfig,
  buildConnectUrl,

  parseCallback(body) {
    // Try URL-encoded first (WooCommerce default)
    const params = new URLSearchParams(body);
    let channelId = Number(params.get("user_id"));
    let consumerKey = params.get("consumer_key") ?? "";
    let consumerSecret = params.get("consumer_secret") ?? "";

    // JSON fallback for non-standard WooCommerce setups
    if (!channelId && body.trimStart().startsWith("{")) {
      try {
        const json = JSON.parse(body) as Record<string, unknown>;
        channelId = Number(json.user_id);
        consumerKey = String(json.consumer_key ?? "");
        consumerSecret = String(json.consumer_secret ?? "");
      } catch {
        // not valid JSON
      }
    }

    if (!channelId || !consumerKey || !consumerSecret) return null;
    return { channelId, credentials: { consumerKey, consumerSecret } };
  },

  async fetchProducts(storeUrl, credentials, search) {
    const auth = basicAuth(credentials.consumerKey, credentials.consumerSecret);
    const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
    const res = await wcFetch(storeUrl, `/products?per_page=100&status=publish${searchParam}`, {
      method: "GET",
      headers: { Authorization: auth },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`WooCommerce fetchProducts failed (${res.status}): ${text.substring(0, 200)}`);
    }
    const data = (await res.json()) as WCProduct[];

    const results: ExternalProduct[] = [];

    for (const p of data) {
      if (!p.id) continue;
      const productType = p.type === "variable" ? "variable" : "simple";
      results.push({
        id: String(p.id),
        name: p.name ?? "Unnamed Product",
        sku: p.sku || undefined,
        stockQuantity: (p.stock_quantity as number) ?? undefined,
        type: productType,
        rawPayload: p as unknown as Record<string, unknown>,
      });
    }

    const variableProducts = data.filter((p) => p.type === "variable");

    const variationPromises = variableProducts.map(async (p) => {
      let page = 1;
      let totalPages = 1;
      const allVariationsForProduct: WCProduct[] = [];

      try {
        do {
          const vRes = await wcFetch(
            storeUrl,
            `/products/${p.id}/variations?per_page=100&status=publish&page=${page}`,
            {
              method: "GET",
              headers: { Authorization: auth },
            }
          );

          if (!vRes.ok) break;

          totalPages = parseInt(vRes.headers.get("x-wp-totalpages") || "1", 10);
          const variations = (await vRes.json()) as WCProduct[];
          allVariationsForProduct.push(...variations);

          page++;
        } while (page <= totalPages);
      } catch {
        // Non-fatal: skip variations for this product if fetch fails
      }

      return { parent: p, variations: allVariationsForProduct };
    });

    const variationsGroups = await Promise.all(variationPromises);

    for (const group of variationsGroups) {
      const { parent: p, variations } = group;
      for (const v of variations) {
        if (!v.id) continue;
        // Build a readable label from attributes (e.g. "Size: L, Color: Red")
        const attrLabel = (v.attributes || [])
          .map((a: { name?: string; option?: string }) => `${a.name}: ${a.option}`)
          .join(", ");
        results.push({
          id: String(v.id),
          name: attrLabel ? `${p.name} — ${attrLabel}` : `${p.name} #${v.id}`,
          sku: v.sku || undefined,
          stockQuantity: (v.stock_quantity as number) ?? undefined,
          type: "variation",
          parentId: String(p.id),
          rawPayload: v as unknown as Record<string, unknown>,
        });
      }
    }

    return results;
  },

  async pushStock(storeUrl, credentials, externalProductId, quantity, parentId) {
    const endpoint = parentId 
      ? `/products/${parentId}/variations/${externalProductId}`
      : `/products/${externalProductId}`;

    const res = await wcFetch(storeUrl, endpoint, {
      method: "PUT",
      headers: { Authorization: basicAuth(credentials.consumerKey, credentials.consumerSecret) },
      body: JSON.stringify({ stock_quantity: quantity, manage_stock: true }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`WooCommerce pushStock failed (${res.status}): ${text.substring(0, 200)}`);
    }
  },

  async registerWebhooks(storeUrl, credentials, channelWebhookBaseUrl) {
    const secret = randomBytes(32).toString("hex");
    const auth = basicAuth(credentials.consumerKey, credentials.consumerSecret);

    // 1. Fetch existing webhooks to clean up duplicates
    try {
      const getRes = await wcFetch(storeUrl, "/webhooks", {
        headers: { Authorization: auth },
      });
      if (getRes.ok) {
        const existingWebhooks = await getRes.json() as Array<{ id: number, delivery_url: string }>;
        const toDelete = existingWebhooks.filter(w => w.delivery_url.startsWith(channelWebhookBaseUrl.split("?")[0]));

        for (const w of toDelete) {
          await wcFetch(storeUrl, `/webhooks/${w.id}?force=true`, {
            method: "DELETE",
            headers: { Authorization: auth },
          });
        }
      }
    } catch (err) {
      console.warn("[woocommerce] failed to cleanup existing webhooks, proceeding with creation", err);
    }

    const webhookIds: string[] = [];
    const topicLabel: Record<string, string> = {
      "order.created": "Order Create",
      "order.updated": "Order Update",
    };
    for (const topic of woocommerceHandler.webhookTopics) {
      const res = await wcFetch(storeUrl, "/webhooks", {
        method: "POST",
        headers: { Authorization: auth },
        body: JSON.stringify({
          name: `${PORTAL_NAME} ${topicLabel[topic] ?? topic} Webhook`,
          topic,
          delivery_url: channelWebhookBaseUrl,
          secret,
          status: "active",
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to register WooCommerce webhook "${topic}" (${res.status}): ${text.substring(0, 200)}`);
      }
      const data = (await res.json()) as { id: number };
      webhookIds.push(String(data.id));
    }

    return { secret };
  },

  processWebhook(body, signature, topic, secret) {
    // Verify HMAC-SHA256 signature: base64(hmac(body, secret))
    const expected = createHmac("sha256", secret).update(body).digest("base64");
    let sigBuffer: Buffer;
    try {
      sigBuffer = Buffer.from(signature, "base64");
    } catch {
      throw new Error("Invalid webhook signature format");
    }
    const expectedBuffer = Buffer.from(expected, "base64");
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new Error("Webhook signature mismatch");
    }

    // Route by topic
    switch (topic) {
      case "order.created": {
        const order = JSON.parse(body) as WCOrderPayload;
        const lineItems = order.line_items || [];
        return lineItems
          .filter((item) => item.product_id && (item.quantity ?? 0) > 0)
          .map((item): WebhookStockChange => ({
            externalProductId: String(item.product_id),
            quantity: -(item.quantity ?? 0),   // sale_out: decrement
            type: "sale_out",
            referenceId: order.id ?? 0,
            referenceType: "woocommerce_order",
          }));
      }
      case "order.cancelled":
      case "order.updated": {
        // Both handled via parseWebhookOrder() in the webhook route.
        // Return empty — the route calls processOrderStockChange() directly.
        return [];
      }
      default:
        // Unknown/future topic — no-op, return empty (route will still 200)
        return [];
    }
  },

  mergeProductUpdate(existingRawData, patch) {
    const rawData = { ...(existingRawData as Record<string, unknown>) };
    // Standard delta fields (name, sku, stock) are handled in services.ts DB columns.
    // Everything else in the patch is checked against our mapping table.
    for (const [key, value] of Object.entries(patch)) {
      const wcKey = FIELD_MAP[key as keyof StandardizedProductRecord]; // Use the global FIELD_MAP
      if (wcKey && value !== undefined) {
        rawData[wcKey] = value;
      } else if (!wcKey && value !== undefined) {
        // If not in FIELD_MAP, pass through using the original key
        rawData[key] = value;
      }
    }
    return rawData;
  },

  // ─── pushPendingUpdates ───────────────────────────────────────────────────
  // Changelog-driven delta push: reads staged changelog entries, merges deltas
  // per product (latest value wins), and pushes only changed fields to WooCommerce.
  async pushPendingUpdates(userId, channelId): Promise<ChannelPushSyncResult> {
    // Lazy-import to avoid circular module deps at load time
    const { db } = await import("@/db");
    const { channels, channelProductMappings, channelProductChangelog } = await import("@/db/schema");
    const { eq, and, inArray } = await import("drizzle-orm");
    const { decryptChannelCredentials } = await import("@/lib/channels/utils");

    const [channel] = await db
      .select({ storeUrl: channels.storeUrl, credentials: channels.credentials })
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
      .limit(1);

    if (!channel) throw new Error("Channel not found.");
    if (!channel.storeUrl) throw new Error("Channel has no store URL.");

    const creds = decryptChannelCredentials(channel.credentials);
    if (!creds.consumerKey || !creds.consumerSecret) {
      throw new Error("WooCommerce credentials are missing. Please reconnect the channel.");
    }
    const auth = basicAuth(creds.consumerKey, creds.consumerSecret);

    const stagedEntries = await db
      .select({
        id: channelProductChangelog.id,
        externalProductId: channelProductChangelog.externalProductId,
        delta: channelProductChangelog.delta,
        createdAt: channelProductChangelog.createdAt,
      })
      .from(channelProductChangelog)
      .where(
        and(
          eq(channelProductChangelog.channelId, channelId),
          eq(channelProductChangelog.status, "staged"),
        ),
      )
      .orderBy(channelProductChangelog.createdAt);

    if (stagedEntries.length === 0) {
      return { pushed: 0, failed: 0, results: [] };
    }

    const results: ChannelPushSyncResult["results"] = [];
    const succeededMappingExtIds: string[] = [];
    const succeededEntryIds: number[] = [];
    const failedEntryData: { entryIds: number[]; error: string; extId: string }[] = [];

    for (const entry of stagedEntries) {
      const wooPayload = buildWcPayload(entry.delta as Record<string, unknown>);

      if (Object.keys(wooPayload).length === 0) {
        succeededEntryIds.push(entry.id);
        succeededMappingExtIds.push(entry.externalProductId);
        results.push({ externalProductId: entry.externalProductId, success: true });
        continue;
      }

      try {
        const res = await wcFetch(channel.storeUrl!, `/products/${entry.externalProductId}`, {
          method: "PUT",
          headers: { Authorization: auth },
          body: JSON.stringify(wooPayload),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`WooCommerce PUT failed (${res.status}): ${text.substring(0, 200)}`);
        }
        results.push({ externalProductId: entry.externalProductId, success: true });
        succeededEntryIds.push(entry.id);
        succeededMappingExtIds.push(entry.externalProductId);
      } catch (err) {
        const errorMsg = String(err).replace(/^Error:\s*/, "").substring(0, 300);
        results.push({ externalProductId: entry.externalProductId, success: false, error: errorMsg });
        failedEntryData.push({ entryIds: [entry.id], error: errorMsg, extId: entry.externalProductId });
      }
    }

    if (succeededEntryIds.length > 0) {
      await db
        .update(channelProductChangelog)
        .set({ status: "success", publishedAt: new Date() })
        .where(inArray(channelProductChangelog.id, succeededEntryIds));
    }

    if (succeededMappingExtIds.length > 0) {
      const successMappings = await db
        .select({ id: channelProductMappings.id })
        .from(channelProductMappings)
        .where(
          and(
            eq(channelProductMappings.channelId, channelId),
            inArray(channelProductMappings.externalProductId, succeededMappingExtIds),
          ),
        );
      if (successMappings.length > 0) {
        await db
          .update(channelProductMappings)
          .set({ syncStatus: "in_sync", lastSyncError: null })
          .where(inArray(channelProductMappings.id, successMappings.map((m) => m.id)));
      }
    }

    for (const { entryIds, error, extId } of failedEntryData) {
      await db
        .update(channelProductChangelog)
        .set({ status: "failed", errorLine: error })
        .where(inArray(channelProductChangelog.id, entryIds));

      await db
        .update(channelProductMappings)
        .set({ syncStatus: "failed", lastSyncError: error })
        .where(
          and(
            eq(channelProductMappings.channelId, channelId),
            eq(channelProductMappings.externalProductId, extId),
          ),
        );
    }

    return { pushed: succeededMappingExtIds.length, failed: failedEntryData.length, results };
  },

  extractSqlField,
  getBrands,
  extractProductFields,

  /**
   * Parse a webhook body into a structured order event.
   * Used by the webhook route to feed into processOrderStockChange().
   */
  parseWebhookOrder(body: string, signature: string, secret: string): WebhookOrderEvent | null {
    // Verify HMAC-SHA256 signature
    const expected = createHmac("sha256", secret).update(body).digest("base64");
    let sigBuffer: Buffer;
    try {
      sigBuffer = Buffer.from(signature, "base64");
    } catch {
      throw new Error("Invalid webhook signature format");
    }
    const expectedBuffer = Buffer.from(expected, "base64");
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new Error("Webhook signature mismatch");
    }

    const order = JSON.parse(body) as WCOrderPayload;
    if (!order.id) return null;

    const lineItems = (order.line_items || []).filter(
      (item) => item.id && (item.quantity ?? 0) > 0,
    );

    const buyerName = order.billing
      ? `${order.billing.first_name || ""} ${order.billing.last_name || ""}`.trim() || null
      : null;

    return {
      externalOrderId: String(order.id),
      status: mapWooCommerceStatus(order.status) as string,
      lineItems: lineItems.map((item) => ({
        externalItemId: String(item.id),
        externalProductId: String(
          item.variation_id && item.variation_id !== 0
            ? item.variation_id
            : item.product_id,
        ),
        variationId: item.variation_id ? String(item.variation_id) : undefined,
        sku: item.sku || undefined,
        quantity: item.quantity ?? 0,
        title: typeof item.name === "string" ? item.name : undefined,
        price: item.price !== undefined && item.price !== null ? String(item.price) : undefined,
        rawData: item as Record<string, unknown>,
      })),
      rawData: order as Record<string, unknown>,
      buyerName,
      buyerEmail: order.billing?.email || null,
      totalAmount: order.total ? String(order.total) : null,
      currency: order.currency || null,
      purchasedAt: order.date_created_gmt
        ? new Date(order.date_created_gmt as unknown as string + "Z")
        : order.date_created
          ? new Date(order.date_created as unknown as string)
          : null,
    };
  },

  /**
   * Fetch orders from the remote channel and persist them as sales_orders.
   */
  async fetchAndSaveOrders(userId: number, channelId: number): Promise<{ fetched: number; saved: number }> {
    const { db } = await import("@/db");
    const { channels, salesOrders, salesOrderItems, channelProductMappings, products } = await import("@/db/schema");
    const { eq, and, isNull } = await import("drizzle-orm");
    const { decryptChannelCredentials } = await import("@/lib/channels/utils");
    const { getLastOrderDate } = await import("./queries");

    const [channel] = await db
      .select({
        storeUrl: channels.storeUrl,
        credentials: channels.credentials,
        channelType: channels.channelType
      })
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
      .limit(1);

    if (!channel) throw new Error("Channel not found.");
    if (channel.channelType !== "woocommerce") throw new Error("Channel is not a WooCommerce channel");
    if (!channel.storeUrl) throw new Error("Channel has no store URL");

    const creds = decryptChannelCredentials(channel.credentials);
    const auth = basicAuth(creds.consumerKey, creds.consumerSecret);

    // Determine fetch window
    const lastOrderDate = await getLastOrderDate(channelId);
    let afterParam = "";
    if (lastOrderDate) {
      // 1 hour buffer for safety
      const bufferDate = new Date(lastOrderDate.getTime() - 60 * 60 * 1000);
      afterParam = `&after=${bufferDate.toISOString()}`;
    } else {
      // Fallback 90 days
      const fallbackDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      afterParam = `&after=${fallbackDate.toISOString()}`;
    }

    console.log(`[WooCommerce Sync] Syncing orders for channel ${channelId} with ${afterParam}`);

    let fetchedCount = 0;
    let savedCount = 0;
    let page = 1;
    let totalPages = 1;

    do {
      const res = await wcFetch(channel.storeUrl, `/orders?per_page=100&page=${page}${afterParam}`, {
        method: "GET",
        headers: { Authorization: auth },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`WooCommerce order fetch failed (${res.status}): ${text.substring(0, 200)}`);
      }

      totalPages = parseInt(res.headers.get("x-wp-totalpages") || "1", 10);
      const orders = (await res.json()) as WCOrderPayload[];

      fetchedCount += orders.length;

      for (const wcOrder of orders) {
        if (!wcOrder.id) continue;
        const externalOrderId = String(wcOrder.id);

        try {
          // Pre-check for existing order
          const [existing] = await db
            .select({
              id: salesOrders.id,
              status: salesOrders.status,
              purchasedAt: salesOrders.purchasedAt,
              rawData: salesOrders.rawData,
            })
            .from(salesOrders)
            .where(
              and(
                eq(salesOrders.channelId, channelId),
                eq(salesOrders.externalOrderId, externalOrderId),
              ),
            )
            .limit(1);

          if (existing) {
            const newStatus = mapWooCommerceStatus(wcOrder.status);

            // If status changed, update and process stock
            if (existing.status !== newStatus) {
              const mergedRawData = {
                ...(existing.rawData as Record<string, unknown> || {}),
                lastWcUpdate: wcOrder,
              };

              await db
                .update(salesOrders)
                .set({
                  status: newStatus,
                  previousStatus: existing.status,
                  rawData: mergedRawData,
                  syncedAt: new Date(),
                })
                .where(eq(salesOrders.id, existing.id));

              // Trigger stock transition (date-gated)
              try {
                const {
                  processOrderStockChange,
                  STOCK_CUTOFF_DATE,
                } = await import("@/lib/stock/service");
                if (
                  existing.purchasedAt &&
                  existing.purchasedAt >= STOCK_CUTOFF_DATE
                ) {
                  await processOrderStockChange(
                    existing.id,
                    newStatus,
                    existing.status,
                    userId,
                  );
                }
              } catch (stockErr) {
                console.error(
                  `[WooCommerce Sync] Stock processing failed for status update on order ${externalOrderId}:`,
                  stockErr,
                );
              }
              savedCount++;
            }
            continue;
          }

          await db.transaction(async (tx) => {
            // Final safety check inside transaction
            const [insideExisting] = await tx
              .select({ id: salesOrders.id })
              .from(salesOrders)
              .where(
                and(
                  eq(salesOrders.channelId, channelId),
                  eq(salesOrders.externalOrderId, externalOrderId),
                ),
              )
              .limit(1);

            if (insideExisting) return;

            const buyerName = wcOrder.billing
              ? `${wcOrder.billing.first_name || ""} ${wcOrder.billing.last_name || ""}`.trim() || null
              : null;
            const buyerEmail = wcOrder.billing?.email || null;

            const [insertedOrder] = await tx.insert(salesOrders).values({
              channelId,
              externalOrderId,
              status: mapWooCommerceStatus(wcOrder.status),
              totalAmount: wcOrder.total ? String(wcOrder.total) : null,
              currency: wcOrder.currency,
              buyerName,
              buyerEmail,
              purchasedAt: wcOrder.date_created_gmt ? new Date(wcOrder.date_created_gmt as unknown as string + "Z") : (wcOrder.date_created ? new Date(wcOrder.date_created as unknown as string) : null),
              rawData: wcOrder as Record<string, unknown>,
            }).returning({ id: salesOrders.id });

            const lineItems = wcOrder.line_items || [];

            for (const item of lineItems) {
              if (!item.id) continue;

              const sku = item.sku ?? "";
              const wcProductId = String(item.product_id || "");
              const wcVariationId = String(item.variation_id || "");

              // We match by Variation ID if it exists, otherwise Product ID. 
              const searchId = item.variation_id && item.variation_id !== 0 ? wcVariationId : wcProductId;

              let matchedProductId: number | undefined;

              if (searchId && searchId !== "0") {
                const [mapping] = await tx
                  .select({ productId: channelProductMappings.productId })
                  .from(channelProductMappings)
                  .where(
                    and(
                      eq(channelProductMappings.channelId, channelId),
                      eq(channelProductMappings.externalProductId, searchId),
                    )
                  )
                  .limit(1);

                matchedProductId = mapping?.productId;
              }

              if (!matchedProductId && sku) {
                const [localProduct] = await tx
                  .select({ id: products.id })
                  .from(products)
                  .where(eq(products.sku, sku))
                  .limit(1);
                if (localProduct) {
                  matchedProductId = localProduct.id;
                }
              }

              await tx.insert(salesOrderItems).values({
                orderId: insertedOrder.id,
                externalItemId: String(item.id),
                productId: matchedProductId,
                sku: item.sku || null,
                title: typeof item.name === "string" ? item.name : (item.name ? String(item.name) : null),
                quantity: item.quantity || 0,
                price: item.price !== undefined && item.price !== null ? String(item.price) : null,
                rawData: item as Record<string, unknown>,
              });
            }
            savedCount++;
          });

          // Process stock for this newly saved order
          // Only process stock for orders from 5 Apr 2026 onwards
          // (stock was manually set on 4 Apr 2026 as the baseline)
          try {
            const { processOrderStockChange, STOCK_CUTOFF_DATE } = await import("@/lib/stock/service");
            const [savedOrder] = await db
              .select({ id: salesOrders.id, status: salesOrders.status, purchasedAt: salesOrders.purchasedAt })
              .from(salesOrders)
              .where(and(eq(salesOrders.channelId, channelId), eq(salesOrders.externalOrderId, externalOrderId)))
              .limit(1);

            if (savedOrder && savedOrder.purchasedAt && savedOrder.purchasedAt >= STOCK_CUTOFF_DATE) {
              await processOrderStockChange(
                savedOrder.id,
                savedOrder.status,
                null, // new order, no previous status
                userId,
              );
            }
          } catch (stockErr) {
            console.error(`[WooCommerce Sync] Stock processing failed for order ${externalOrderId}:`, stockErr);
            // Non-fatal: order is saved, stock processing can be retried
          }
        } catch (err) {
          console.error(`[WooCommerce Sync] Failed to save order ${externalOrderId}:`, err);
        }
      }

      page++;
    } while (page <= totalPages);

    // Retroactive mapping check
    try {
      const pendingItems = await db
        .select({
          id: salesOrderItems.id,
          orderId: salesOrderItems.orderId,
          sku: salesOrderItems.sku,
          rawData: salesOrderItems.rawData,
        })
        .from(salesOrderItems)
        .innerJoin(salesOrders, eq(salesOrderItems.orderId, salesOrders.id))
        .where(
          and(
            eq(salesOrders.channelId, channelId),
            isNull(salesOrderItems.productId)
          )
        );

      for (const item of pendingItems) {
        const payload = item.rawData as Record<string, unknown> | null;
        if (!payload) continue;

        const variationId = payload.variation_id as number;
        const productId = payload.product_id as number;
        const searchId = variationId ? String(variationId) : String(productId);
        const sku = item.sku ?? "";

        let matchedProductId: number | undefined;

        if (searchId && searchId !== "0") {
          const [mapping] = await db
            .select({ productId: channelProductMappings.productId })
            .from(channelProductMappings)
            .where(
              and(
                eq(channelProductMappings.channelId, channelId),
                eq(channelProductMappings.externalProductId, searchId)
              )
            )
            .limit(1);
          matchedProductId = mapping?.productId;
        }

        if (!matchedProductId && sku) {
          const [localProduct] = await db
            .select({ id: products.id })
            .from(products)
            .where(eq(products.sku, sku))
            .limit(1);
          if (localProduct) {
            matchedProductId = localProduct.id;
          }
        }

        if (matchedProductId) {
          await db
            .update(salesOrderItems)
            .set({ productId: matchedProductId })
            .where(eq(salesOrderItems.id, item.id));

          // Process stock for retroactively mapped orders (date-gated)
          try {
            const [order] = await db
              .select({
                id: salesOrders.id,
                status: salesOrders.status,
                purchasedAt: salesOrders.purchasedAt,
                stockProcessed: salesOrders.stockProcessed,
              })
              .from(salesOrders)
              .where(eq(salesOrders.id, item.orderId))
              .limit(1);

            const { STOCK_CUTOFF_DATE, processOrderStockChange } = await import("@/lib/stock/service");
            if (order && !order.stockProcessed && order.purchasedAt && order.purchasedAt >= STOCK_CUTOFF_DATE) {
              await processOrderStockChange(order.id, order.status, null, userId);
            }
          } catch (stockErr) {
            console.error(`[WooCommerce Sync] Retroactive stock failed for item ${item.id}:`, stockErr);
          }
        }
      }
    } catch (err) {
      console.error("[WooCommerce Sync] Failed to map past items:", err);
    }

    return { fetched: fetchedCount, saved: savedCount };
  },
};

function mapWooCommerceStatus(rawStatus: string | undefined): "pending" | "processing" | "on-hold" | "packed" | "shipped" | "delivered" | "cancelled" | "returned" | "refunded" | "failed" | "draft" {
  if (!rawStatus) return "pending";

  const status = rawStatus.startsWith("wc-") ? rawStatus.substring(3) : rawStatus;

  switch (status) {
    case "pending": return "pending";
    case "processing": return "processing";
    case "on-hold": return "on-hold";
    case "packed": return "packed";
    case "shipped": return "shipped";
    case "completed": return "delivered";
    case "cancelled": return "cancelled";
    case "refunded": return "refunded";
    case "failed": return "failed";
    case "checkout-draft":
    case "draft": return "draft";
    default: return "pending";
  }
}

// Internal helper for testing and reuse
export function buildWcPayload(delta: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(delta)) {
    let wcKey: string;
    if (key === "stockQuantity") {
      payload.manage_stock = true;
      wcKey = "stock_quantity";
    } else {
      wcKey = (FIELD_MAP[key as keyof StandardizedProductRecord] as string) || (key as string);
    }
    let val = value;
    if (wcKey === "regular_price" || wcKey === "weight") {
      val = String(value ?? "");
    }
    payload[wcKey] = val;
  }
  return payload;
}
