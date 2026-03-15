import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { ChannelHandler, WebhookStockChange, ExternalProduct } from "../types";
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
type WCVariation = WCProduct; // WooCommerce Variations are essentially Products with a parent_id

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
      const allVariationsForProduct: WCVariation[] = [];

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
          const variations = (await vRes.json()) as WCVariation[];
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

  extractSqlField,
  getBrands,
  extractProductFields,
};
