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
  extractRelationships,
} from "./config";
import { extractSqlField, getBrands, getLastOrderDate } from "./queries";

export const amazonHandler: ChannelHandler = {
  id: "amazon",
  configFields,
  capabilities,
  webhookTopics: [],
  validateConfig,
  buildConnectUrl,
  extractRelationships,

  parseCallback() {
    // Not used for API key auth type.
    return null;
  },

  async fetchProducts(storeUrl, credentials, search) {
    if (
      !credentials.marketplaceId ||
      !credentials.clientId ||
      !credentials.clientSecret ||
      !credentials.refreshToken
    ) {
      throw new Error(
        "Missing required Amazon credentials (marketplaceId, clientId, clientSecret, refreshToken)",
      );
    }

    const client = new AmazonAPIClient(credentials, storeUrl);
    return await client.fetchProducts(search);
  },

  async getCatalogItem(storeUrl, credentials, asin, sku) {
    const { AmazonAPIClient } = await import("./api/client");
    const client = new AmazonAPIClient(credentials, storeUrl);
    return await client.getCatalogItem(asin, sku);
  },

  async pushStock(
    storeUrl,
    credentials,
    externalProductId,
    quantity,
    parentId,
    sku,
    productType,
    rawData,
  ) {
    if (
      !credentials.marketplaceId ||
      !credentials.clientId ||
      !credentials.clientSecret ||
      !credentials.refreshToken ||
      !credentials.merchantId
    ) {
      throw new Error(
        "Missing required Amazon credentials (merchantId missing?). Please update channel settings.",
      );
    }

    const client = new AmazonAPIClient(credentials, storeUrl);

    const identifier = sku || externalProductId;

    if (!identifier)
      throw new Error("No SKU or external ID found for this Amazon mapping.");

    const fcCode = (rawData?.fulfillmentChannelCode as string) || "DEFAULT";

    console.log(
      `[Amazon pushStock] Pushing stock for ${identifier} (Type: ${productType || "PRODUCT"}, Channel: ${fcCode}, Qty: ${quantity})`,
    );

    // Direct PATCH to Listings API
    await client.patchListingsItem(
      credentials.merchantId,
      identifier,
      [
        {
          op: "replace",
          path: "/attributes/fulfillment_availability",
          value: [
            {
              fulfillment_channel_code: fcCode,
              quantity: quantity,
            },
          ],
        },
      ],
      productType || "PRODUCT",
    );
  },

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
  async fetchAndSaveOrders(
    userId: number,
    channelId: number,
  ): Promise<{ fetched: number; saved: number }> {
    const { db } = await import("@/db");
    const {
      channels,
      salesOrders,
      salesOrderItems,
      channelProductMappings,
      products,
    } = await import("@/db/schema");
    const { eq, and, or, isNull } = await import("drizzle-orm");
    const { decryptChannelCredentials } = await import("@/lib/channels/utils");

    const [channel] = await db
      .select({
        storeUrl: channels.storeUrl,
        credentials: channels.credentials,
        channelType: channels.channelType,
      })
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
      .limit(1);

    if (!channel) throw new Error("Channel not found.");
    if (channel.channelType !== "amazon")
      throw new Error("Channel is not an Amazon channel");

    const creds = decryptChannelCredentials(channel.credentials);
    const client = new AmazonAPIClient(creds, channel.storeUrl || "");

    // Determine fetch window: last order in DB minus 1 hour for safety, or fallback 90 days
    const lastOrderDate = await getLastOrderDate(channelId);
    const bufferMs = 60 * 60 * 1000; // 1 hour buffer for safety
    const lastUpdatedAfter = (
      lastOrderDate
        ? new Date(lastOrderDate.getTime() - bufferMs)
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    ).toISOString();

    // Log the sync range for debugging
    console.log(
      `[Amazon Sync] Syncing orders updated after for channel ${channelId} from ${lastUpdatedAfter}`,
    );
    const ordersGenerator = client.getOrdersPagedGenerator(lastUpdatedAfter);

    let fetchedCount = 0;
    let savedCount = 0;

    for await (const pageOrders of ordersGenerator) {
      fetchedCount += pageOrders.length;

      for (const amzOrder of pageOrders) {
        try {
          // 1. Pre-check if order already exists (out of tx to save connection)
          // 1. Pre-check for existing order
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
                eq(salesOrders.externalOrderId, amzOrder.AmazonOrderId),
              ),
            )
            .limit(1);

          if (existing) {
            const newStatus = mapAmazonStatus(amzOrder.OrderStatus);

            // If status changed, update and process stock
            if (existing.status !== newStatus) {
              const mergedRawData = {
                ...(existing.rawData as Record<string, unknown> || {}),
                lastAmzUpdate: amzOrder,
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
                  `[Amazon Sync] Stock processing failed for status update on order ${amzOrder.AmazonOrderId}:`,
                  stockErr,
                );
              }
              savedCount++;
            }
            continue;
          }

          // 2. Fetch Buyer Info, Address, and Items in parallel (OUTSIDE transaction)
          const [buyerRes, addressRes, itemsRes] = await Promise.all([
            client.getOrderBuyerInfo(amzOrder.AmazonOrderId),
            client.getOrderAddress(amzOrder.AmazonOrderId),
            client.getOrderItems(amzOrder.AmazonOrderId),
          ]);

          // Throttling: respect SP-API burst/restore limits (approx 0.5s restore rate for these endpoints)
          await new Promise((resolve) => setTimeout(resolve, 500));

          await db.transaction(async (tx) => {
            // Double check inside tx for atomicity (optional but safer)
            const [insideExisting] = await tx
              .select({ id: salesOrders.id })
              .from(salesOrders)
              .where(
                and(
                  eq(salesOrders.channelId, channelId),
                  eq(salesOrders.externalOrderId, amzOrder.AmazonOrderId),
                ),
              )
              .limit(1);

            if (insideExisting) return;

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
            const [insertedOrder] = await tx
              .insert(salesOrders)
              .values({
                channelId,
                externalOrderId: amzOrder.AmazonOrderId,
                status: mapAmazonStatus(amzOrder.OrderStatus),
                totalAmount: amzOrder.OrderTotal?.Amount,
                currency: amzOrder.OrderTotal?.CurrencyCode,
                buyerName: resolvedBuyerName,
                buyerEmail: resolvedBuyerEmail,
                purchasedAt: amzOrder.PurchaseDate
                  ? new Date(amzOrder.PurchaseDate)
                  : null,
                rawData: {
                  order: amzOrder as Record<string, unknown>,
                  buyerInfo: buyerRes as Record<string, unknown>,
                  shippingAddress: addressRes as Record<string, unknown>,
                },
              })
              .returning({ id: salesOrders.id });

            // 4. Insert Order Items
            const amzItems = itemsRes?.OrderItems || [];
            for (const item of amzItems) {
              const asin = item.ASIN ?? "";
              const sku = item.SellerSKU ?? "";

              // Match by ASIN and SKU
              const [mapping] =
                asin || sku
                  ? await tx
                      .select({ productId: channelProductMappings.productId })
                      .from(channelProductMappings)
                      .where(
                        and(
                          eq(channelProductMappings.channelId, channelId),
                          or(
                            asin
                              ? eq(
                                  channelProductMappings.externalProductId,
                                  asin,
                                )
                              : undefined,
                            sku
                              ? eq(
                                  channelProductMappings.externalProductId,
                                  sku,
                                )
                              : undefined,
                          ),
                        ),
                      )
                      .limit(1)
                  : [];

              let matchedProductId = mapping?.productId;

              // Fallback: Check if the SellerSKU exactly matches a SeplorX product
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
                externalItemId: item.OrderItemId,
                productId: matchedProductId,
                sku: item.SellerSKU,
                title: item.Title,
                quantity: item.QuantityOrdered,
                price: item.ItemPrice?.Amount,
                rawData: item as Record<string, unknown>,
              });
            }
            savedCount++;
          });

          // Process stock for this newly saved order (date-gated)
          try {
            const { processOrderStockChange, STOCK_CUTOFF_DATE } =
              await import("@/lib/stock/service");
            const [savedOrder] = await db
              .select({ id: salesOrders.id, status: salesOrders.status, purchasedAt: salesOrders.purchasedAt })
              .from(salesOrders)
              .where(
                and(
                  eq(salesOrders.channelId, channelId),
                  eq(salesOrders.externalOrderId, amzOrder.AmazonOrderId),
                ),
              )
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
            console.error(
              `[Amazon Sync] Stock processing failed for order ${amzOrder.AmazonOrderId}:`,
              stockErr,
            );
          }
        } catch (err) {
          console.error(
            `[Amazon Sync] Failed to save order ${amzOrder.AmazonOrderId}:`,
            err,
          );
        }
      }
    }

    // 5. Retroactive mapping check: try to match order items that still have no productId
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
            isNull(salesOrderItems.productId),
          ),
        );

      for (const item of pendingItems) {
        const payload = item.rawData as Record<string, unknown> | null;
        const asin = (payload?.ASIN as string) ?? "";
        const sku = item.sku ?? "";

        let matchedProductId: number | undefined;

        const [mapping] =
          asin || sku
            ? await db
                .select({ productId: channelProductMappings.productId })
                .from(channelProductMappings)
                .where(
                  and(
                    eq(channelProductMappings.channelId, channelId),
                    or(
                      asin
                        ? eq(channelProductMappings.externalProductId, asin)
                        : undefined,
                      sku
                        ? eq(channelProductMappings.externalProductId, sku)
                        : undefined,
                    ),
                  ),
                )
                .limit(1)
            : [];

        matchedProductId = mapping?.productId;

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
            console.error(`[Amazon Sync] Retroactive stock failed for item ${item.id}:`, stockErr);
          }
        }
      }
    } catch (err) {
      console.error("[Amazon Sync] Failed to map past items:", err);
    }

    return { fetched: fetchedCount, saved: savedCount };
  },
};

function mapAmazonStatus(
  status: string | undefined,
):
  | "pending"
  | "processing"
  | "on-hold"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned"
  | "refunded"
  | "failed"
  | "draft" {
  if (!status) return "pending";
  switch (status) {
    case "PendingAvailability":
    case "Pending":
      return "pending";
    case "Unshipped":
      return "processing"; // Amazon Unshipped aligns with WooCommerce Processing
    case "PartiallyShipped":
      return "packed"; // Amazon PartiallyShipped aligns with WooCommerce Packed
    case "Shipped":
      return "shipped";
    case "InvoiceUnconfirmed":
      return "on-hold";
    case "Canceled":
      return "cancelled";
    case "Unfulfillable":
      return "failed";
    default:
      return "pending";
  }
}
