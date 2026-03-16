// Amazon SP-API handler
// The SDK (@amazon-sp-api-release/amazon-sp-api-sdk-js) uses node:fs and other
// Node built-ins. It is listed in next.config.ts → serverExternalPackages so
// Next.js/Turbopack never tries to bundle it. The dynamic import() below is
// resolved at runtime on the server only.

import type { ChannelHandler } from "../types";
import { AmazonAPIClient } from "./api/client";

import {
  configFields,
  capabilities,
  validateConfig,
  buildConnectUrl,
  extractProductFields,
} from "./config";
import { extractSqlField, getBrands } from "./queries";

export const amazonHandler: ChannelHandler = {
  id: "amazon",
  configFields,
  capabilities,
  webhookTopics: [],

  validateConfig,
  buildConnectUrl,

  parseCallback() {
    // Not used for API key auth type.
    return null;
  },

  async fetchProducts(storeUrl, credentials, search) {
    if (!credentials.marketplaceId || !credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      throw new Error("Missing required Amazon credentials (marketplaceId, clientId, clientSecret, refreshToken)");
    }

    const client = new AmazonAPIClient(credentials, storeUrl);
    return await client.fetchProducts(search);
  },

  async getCatalogItem(storeUrl, credentials, asin, sku, fulfillmentChannel) {
    if (!credentials.marketplaceId || !credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      throw new Error("Missing required Amazon credentials (marketplaceId, clientId, clientSecret, refreshToken)");
    }

    const client = new AmazonAPIClient(credentials, storeUrl);
    return await client.getCatalogItem(asin, sku, fulfillmentChannel);
  },

  // pushStock: not implemented — capabilities.canPushStock = false
  // registerWebhooks: not applicable — capabilities.usesWebhooks = false
  // processWebhook: not applicable — capabilities.usesWebhooks = false

  mergeProductUpdate(_existingRawData, patch) {
    const updates: Record<string, unknown> = {};
    
    // Flat mapping for Amazon updates
    if (patch.price) updates["price"] = patch.price;
    if (patch.itemCondition) updates["item-condition"] = patch.itemCondition;
    if (patch.brand) updates["brand-name"] = patch.brand;
    if (patch.manufacturer) updates["manufacturer"] = patch.manufacturer;
    if (patch.partNumber) updates["part_number"] = patch.partNumber;
    if (patch.color) updates["color"] = patch.color;
    if (patch.itemTypeKw) updates["item_type_keyword"] = patch.itemTypeKw;
    if (patch.description) updates["product_description"] = patch.description;
    
    // Weights
    if (patch.pkgWeight) updates["pkg_weight"] = patch.pkgWeight;
    if (patch.itemWeight) updates["item_weight"] = patch.itemWeight;

    return Object.keys(updates).length > 0 ? updates : null;
  },

  extractSqlField,
  getBrands,
  extractProductFields,

  /**
   * High-level orchestrator to fetch orders from Amazon and persist them.
   */
  async fetchAndSaveOrders(userId: number, channelId: number): Promise<{ fetched: number; saved: number }> {
    const { db } = await import("@/db");
    const { channels, salesOrders, salesOrderItems, channelProductMappings } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { decryptChannelCredentials } = await import("@/lib/channels/utils");

    const [channel] = await db
      .select({ storeUrl: channels.storeUrl, credentials: channels.credentials })
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
      .limit(1);

    if (!channel) throw new Error("Channel not found.");
    const creds = decryptChannelCredentials(channel.credentials);
    const client = new AmazonAPIClient(creds, channel.storeUrl || "");

    // Fetch orders from the last 30 days
    const createdAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ordersRes = await client.getOrders(createdAfter);
    const amazonOrders = ordersRes?.Orders || [];

    let savedCount = 0;

    for (const amzOrder of amazonOrders) {
      try {
        await db.transaction(async (tx) => {
          // 1. Check if order already exists
          const [existing] = await tx
            .select({ id: salesOrders.id })
            .from(salesOrders)
            .where(and(eq(salesOrders.channelId, channelId), eq(salesOrders.externalOrderId, amzOrder.AmazonOrderId)))
            .limit(1);

          if (existing) return;

          // 2. Fetch Buyer Info, Address, and Items in parallel
          const [buyerRes, addressRes, itemsRes] = await Promise.all([
            client.getOrderBuyerInfo(amzOrder.AmazonOrderId),
            client.getOrderAddress(amzOrder.AmazonOrderId),
            client.getOrderItems(amzOrder.AmazonOrderId),
          ]);

          // Resolve buyer name: dedicated endpoint > embedded BuyerInfo in order > fallback
          const resolvedBuyerName =
            buyerRes?.BuyerName ||
            amzOrder.BuyerInfo?.BuyerName ||
            amzOrder.DefaultShipFromLocationAddress?.Name ||
            addressRes?.ShippingAddress?.Name ||
            null;

          // Resolve buyer email — not exposed by v0 BuyerInfo endpoint
          const resolvedBuyerEmail: string | null = null;

          // 3. Insert Sales Order with full rawData
          const [insertedOrder] = await tx.insert(salesOrders).values({
            channelId,
            externalOrderId: amzOrder.AmazonOrderId,
            status: mapAmazonStatus(amzOrder.OrderStatus),
            totalAmount: amzOrder.OrderTotal?.Amount,
            currency: amzOrder.OrderTotal?.CurrencyCode,
            buyerName: resolvedBuyerName,
            buyerEmail: resolvedBuyerEmail,
            purchasedAt: amzOrder.PurchaseDate ? new Date(amzOrder.PurchaseDate) : null,
            rawData: {
              order: amzOrder as Record<string, unknown>,
              buyerInfo: buyerRes as Record<string, unknown>,
              shippingAddress: addressRes as Record<string, unknown>,
            },
          }).returning({ id: salesOrders.id });

          // 4. Insert Order Items with full rawData
          const amzItems = itemsRes?.OrderItems || [];
          for (const item of amzItems) {
            // Try to find a product mapping in SeplorX
            const [mapping] = await tx
              .select({ productId: channelProductMappings.productId })
              .from(channelProductMappings)
              .where(and(
                eq(channelProductMappings.channelId, channelId),
                eq(channelProductMappings.externalProductId, item.ASIN ?? "")
              ))
              .limit(1);

            await tx.insert(salesOrderItems).values({
              orderId: insertedOrder.id,
              externalItemId: item.OrderItemId,
              productId: mapping?.productId,
              sku: item.SellerSKU,
              title: item.Title,
              quantity: item.QuantityOrdered,
              price: item.ItemPrice?.Amount,
              rawData: item as Record<string, unknown>,
            });
          }
          savedCount++;
        });
      } catch (err) {
        console.error(`[Amazon Sync] Failed to save order ${amzOrder.AmazonOrderId}:`, err);
      }
    }

    return { fetched: amazonOrders.length, saved: savedCount };
  },
};

/**
 * Maps Amazon OrderStatus to SeplorX salesOrderStatusEnum
 */
function mapAmazonStatus(status: string): "pending" | "shipped" | "cancelled" | "returned" | "failed" {
  switch (status) {
    case "Shipped":
      return "shipped";
    case "Canceled":
      return "cancelled";
    case "Unfulfillable":
      return "failed";
    default:
      return "pending";
  }
}
