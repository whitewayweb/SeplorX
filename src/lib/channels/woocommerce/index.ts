import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { ChannelHandler, WebhookStockChange, ExternalProduct, ChannelPushSyncResult } from "../types";
import { extractSqlField, getBrands } from "./queries";

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
  // To add new topics in future: add the string here + handle in processWebhook().
  webhookTopics: ["order.created", "order.cancelled"] as const,

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

  async pushStock(storeUrl, credentials, externalProductId, quantity) {
    const res = await wcFetch(storeUrl, `/products/${externalProductId}`, {
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

    const webhookIds: string[] = [];
    for (const topic of woocommerceHandler.webhookTopics) {
      const res = await wcFetch(storeUrl, "/webhooks", {
        method: "POST",
        headers: { Authorization: auth },
        body: JSON.stringify({
          name: `SeplorX — ${topic}`,
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
      case "order.cancelled": {
        const order = JSON.parse(body) as WCOrderPayload;
        const lineItems = order.line_items || [];
        return lineItems
          .filter((item) => item.product_id && (item.quantity ?? 0) > 0)
          .map((item): WebhookStockChange => ({
            externalProductId: String(item.product_id),
            quantity: (item.quantity ?? 0),    // return: increment
            type: "return",
            referenceId: order.id ?? 0,
            referenceType: "woocommerce_order",
          }));
      }
      default:
        // Unknown/future topic — no-op, return empty (route will still 200)
        return [];
    }
  },

  // ─── pushPendingUpdates ───────────────────────────────────────────────────
  // Called by the generic pushChannelProductUpdatesService() in services.ts.
  // No channel-type switch needed anywhere — just implement this method to
  // participate in the sync pipeline.
  async pushPendingUpdates(userId, channelId): Promise<ChannelPushSyncResult> {
    // Lazy-import to avoid circular module deps at load time
    const { db } = await import("@/db");
    const { channels, channelProducts, channelProductMappings } = await import("@/db/schema");
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

    // Fetch all pending mappings joined with cached channel product data
    const pendingMappings = await db
      .select({
        mappingId: channelProductMappings.id,
        externalProductId: channelProductMappings.externalProductId,
        channelProductName: channelProducts.name,
        channelProductSku: channelProducts.sku,
        channelProductRawData: channelProducts.rawData,
      })
      .from(channelProductMappings)
      .innerJoin(
        channelProducts,
        and(
          eq(channelProducts.channelId, channelId),
          eq(channelProducts.externalId, channelProductMappings.externalProductId),
        ),
      )
      .where(
        and(
          eq(channelProductMappings.channelId, channelId),
          eq(channelProductMappings.syncStatus, "pending_update"),
        ),
      );

    if (pendingMappings.length === 0) {
      return { pushed: 0, failed: 0, results: [] };
    }

    const results: ChannelPushSyncResult["results"] = [];
    const succeededIds: number[] = [];
    const failedData: { id: number; error: string }[] = [];

    for (const mapping of pendingMappings) {
      const { externalProductId, channelProductName, channelProductSku } = mapping;
      const rawData = (mapping.channelProductRawData ?? {}) as Record<string, unknown>;

      // Only send fields SeplorX explicitly manages — never clear unknown WC fields
      const wooPayload: Record<string, unknown> = {};
      if (channelProductName)        wooPayload.name              = channelProductName;
      if (channelProductSku)         wooPayload.sku               = channelProductSku;
      if (rawData.description)       wooPayload.description       = rawData.description;
      if (rawData.short_description) wooPayload.short_description = rawData.short_description;
      if (rawData.regular_price)     wooPayload.regular_price     = String(rawData.regular_price);
      if (rawData.price)             wooPayload.regular_price     = String(rawData.price);
      if (rawData.weight)            wooPayload.weight            = String(rawData.weight);

      try {
        const res = await wcFetch(channel.storeUrl!, `/products/${externalProductId}`, {
          method: "PUT",
          headers: { Authorization: auth },
          body: JSON.stringify(wooPayload),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`WooCommerce PUT failed (${res.status}): ${text.substring(0, 200)}`);
        }
        results.push({ externalProductId, success: true });
        succeededIds.push(mapping.mappingId);
      } catch (err) {
        const errorMsg = String(err).replace(/^Error:\s*/, "").substring(0, 300);
        results.push({ externalProductId, success: false, error: errorMsg });
        failedData.push({ id: mapping.mappingId, error: errorMsg });
      }
    }

    // Write sync statuses atomically
    if (succeededIds.length > 0) {
      await db
        .update(channelProductMappings)
        .set({ syncStatus: "in_sync", lastSyncError: null })
        .where(inArray(channelProductMappings.id, succeededIds));
    }
    for (const { id, error } of failedData) {
      await db
        .update(channelProductMappings)
        .set({ syncStatus: "failed", lastSyncError: error })
        .where(eq(channelProductMappings.id, id));
    }

    return { pushed: succeededIds.length, failed: failedData.length, results };
  },

  extractSqlField,
  getBrands,
  extractProductFields,
};
