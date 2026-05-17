// Amazon SP-API handler
// The SDK (@amazon-sp-api-release/amazon-sp-api-sdk-js) uses node:fs and other
// Node built-ins. It is listed in next.config.ts → serverExternalPackages so
// Next.js/Turbopack never tries to bundle it. The dynamic import() below is
// resolved at runtime on the server only.

import type { ChannelHandler, OrderFetchResult } from "../types";
import { AmazonAPIClient } from "./api/client";
import { logger } from "@/lib/logger";
import type { SalesOrderStatus } from "@/db/schema";
import type { OrdersV0Schema } from "./api/types/ordersV0Schema";
import { syncAmazonOrderFinances } from "./finances";

import {
  configFields,
  capabilities,
  validateConfig,
  buildConnectUrl,
  extractProductFields,
  extractRelationships,
} from "./config";
import { extractSqlField, getBrands } from "./queries";

type AmazonOrder = OrdersV0Schema["Order"];

const STALE_SHIPPED_RECONCILE_LIMIT = 25;
const AMAZON_ORDER_DETAIL_DELAY_MS = 2_000;

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

    logger.info(
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
  ): Promise<OrderFetchResult> {
    const { db } = await import("@/db");
    const {
      channels,
      salesOrders,
      salesOrderItems,
      channelProductMappings,
      products,
    } = await import("@/db/schema");
    const { eq, and, or, isNull, inArray, asc } = await import("drizzle-orm");
    const { decryptChannelCredentials } = await import("@/lib/channels/utils");
    const { resolveSalesOrderItemCostSnapshot } = await import("@/lib/orders/costs");

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

    const creds = await decryptChannelCredentials(channel.credentials);
    const client = new AmazonAPIClient(creds, channel.storeUrl || "");

    // Determine fetch window: last order in DB minus 1 hour for safety, or fallback 90 days
    const { getLastSyncDate } = await import("./queries");
    const lastSyncDate = await getLastSyncDate(channelId);
    const bufferMs = 60 * 60 * 1000; // 1 hour buffer for safety
    const lastUpdatedAfter = (
      lastSyncDate
        ? new Date(lastSyncDate.getTime() - bufferMs)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Fallback 30 days instead of 90
    ).toISOString();

    // Log the sync range for debugging
    logger.info(`[Amazon Sync] Syncing orders updated after for channel ${channelId} from ${lastUpdatedAfter}`);
    const ordersGenerator = client.getOrdersPagedGenerator(lastUpdatedAfter);

    let fetchedCount = 0;
    let savedCount = 0;
    const amazonShippedReconciliation: NonNullable<OrderFetchResult["amazonShippedReconciliation"]> = {
      checked: 0,
      delivered: 0,
      unchanged: 0,
      failed: 0,
    };

    for await (const pageOrders of ordersGenerator) {
      fetchedCount += pageOrders.length;
      logger.info(`[Amazon Sync] Processing page with ${pageOrders.length} orders (Total fetched: ${fetchedCount})`);

      for (const amzOrder of pageOrders) {
        try {
          logger.info(`[Amazon Sync] Processing order ${amzOrder.AmazonOrderId} (${amzOrder.OrderStatus})`);
          // Pre-check for existing order
          const [existing] = await db
            .select({
              id: salesOrders.id,
              status: salesOrders.status,
              purchasedAt: salesOrders.purchasedAt,
              buyerName: salesOrders.buyerName,
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
            const newStatus = mapAmazonOrderStatus(amzOrder);

            // If status changed, update and process stock
            if (existing.status !== newStatus) {
              const mergedRawData = {
                ...(existing.rawData as Record<string, unknown> || {}),
                lastAmzUpdate: amzOrder,
              };

              const resolvedBuyerName = amzOrder.BuyerInfo?.BuyerName
                || null;

              await db
                .update(salesOrders)
                .set({
                  status: newStatus,
                  previousStatus: existing.status,
                  rawData: mergedRawData,
                  syncedAt: new Date(),
                  ...(amzOrder.OrderTotal?.Amount ? { totalAmount: amzOrder.OrderTotal.Amount } : {}),
                  ...(amzOrder.OrderTotal?.CurrencyCode ? { currency: amzOrder.OrderTotal.CurrencyCode } : {}),
                  ...(resolvedBuyerName && !existing.buyerName ? { buyerName: resolvedBuyerName } : {}),
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
                logger.error(
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
          await sleep(500);

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
                status: mapAmazonOrderStatus(amzOrder),
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

              const costSnapshot = await resolveSalesOrderItemCostSnapshot(tx, matchedProductId);

              await tx.insert(salesOrderItems).values({
                orderId: insertedOrder.id,
                externalItemId: item.OrderItemId,
                productId: matchedProductId,
                sku: item.SellerSKU,
                title: item.Title,
                quantity: item.QuantityOrdered,
                price: item.ItemPrice?.Amount,
                unitCost: costSnapshot.unitCost,
                costSource: costSnapshot.costSource,
                costCapturedAt: costSnapshot.costCapturedAt,
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
            logger.error(`[Amazon Sync] Stock processing failed for order ${amzOrder.AmazonOrderId}:`, stockErr);
          }
        } catch (err) {
          logger.error(`[Amazon Sync] Failed to save order ${amzOrder.AmazonOrderId}:`, err);
        }
      }
    }

    // 5. Retroactive mapping check: try to match order items that still have no productId (batched)
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

      if (pendingItems.length > 0) {
        // Collect all external IDs and SKUs to batch-query
        const externalIds = new Set<string>();
        const skus = new Set<string>();
        for (const item of pendingItems) {
          const payload = item.rawData as Record<string, unknown> | null;
          const asin = (payload?.ASIN as string) ?? "";
          if (asin) externalIds.add(asin);
          if (item.sku) {
            externalIds.add(item.sku);
            skus.add(item.sku);
          }
        }

        // Batch fetch all mappings for this channel
        const allMappings = externalIds.size > 0
          ? await db
              .select({
                externalProductId: channelProductMappings.externalProductId,
                productId: channelProductMappings.productId,
              })
              .from(channelProductMappings)
              .where(
                and(
                  eq(channelProductMappings.channelId, channelId),
                  inArray(channelProductMappings.externalProductId, [...externalIds]),
                ),
              )
          : [];

        // Batch fetch all local products by SKU
        const allLocalProducts = skus.size > 0
          ? await db
              .select({ id: products.id, sku: products.sku })
              .from(products)
              .where(inArray(products.sku, [...skus]))
          : [];

        // Build lookup maps
        const mappingByExtId = new Map(allMappings.map(m => [m.externalProductId, m.productId]));
        const productBySku = new Map(allLocalProducts.map(p => [p.sku, p.id]));

        for (const item of pendingItems) {
          const payload = item.rawData as Record<string, unknown> | null;
          const asin = (payload?.ASIN as string) ?? "";
          const sku = item.sku ?? "";

          let matchedProductId = mappingByExtId.get(asin) || mappingByExtId.get(sku);
          if (!matchedProductId && sku) {
            matchedProductId = productBySku.get(sku);
          }

          if (matchedProductId) {
            const costSnapshot = await resolveSalesOrderItemCostSnapshot(db, matchedProductId);

            await db
              .update(salesOrderItems)
              .set({
                productId: matchedProductId,
                unitCost: costSnapshot.unitCost,
                costSource: costSnapshot.costSource,
                costCapturedAt: costSnapshot.costCapturedAt,
              })
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
              logger.error(`[Amazon Sync] Retroactive stock failed for item ${item.id}:`, stockErr);
            }
          }
        }
      }
    } catch (err) {
      logger.error("[Amazon Sync] Failed to map past items:", err);
    }

    try {
      const staleShippedOrders = await db
        .select({
          id: salesOrders.id,
          externalOrderId: salesOrders.externalOrderId,
          status: salesOrders.status,
          purchasedAt: salesOrders.purchasedAt,
          rawData: salesOrders.rawData,
        })
        .from(salesOrders)
        .where(
          and(
            eq(salesOrders.channelId, channelId),
            eq(salesOrders.status, "shipped"),
          ),
        )
        .orderBy(asc(salesOrders.syncedAt))
        .limit(STALE_SHIPPED_RECONCILE_LIMIT);

      for (const order of staleShippedOrders) {
        try {
          const latestOrder = await client.getOrder(order.externalOrderId);
          amazonShippedReconciliation.checked++;
          if (!latestOrder) {
            amazonShippedReconciliation.failed++;
            continue;
          }

          const newStatus = mapAmazonOrderStatus(latestOrder);
          const mergedRawData = {
            ...((order.rawData as Record<string, unknown>) || {}),
            lastAmzUpdate: latestOrder,
          };

          await db
            .update(salesOrders)
            .set({
              status: newStatus,
              previousStatus: order.status !== newStatus ? order.status : undefined,
              rawData: mergedRawData,
              syncedAt: new Date(),
            })
            .where(eq(salesOrders.id, order.id));

          if (order.status !== newStatus) {
            try {
              const {
                processOrderStockChange,
                STOCK_CUTOFF_DATE,
              } = await import("@/lib/stock/service");
              if (order.purchasedAt && order.purchasedAt >= STOCK_CUTOFF_DATE) {
                await processOrderStockChange(
                  order.id,
                  newStatus,
                  order.status,
                  userId,
                );
              }
            } catch (stockErr) {
              logger.error(
                `[Amazon Sync] Stock processing failed for reconciled order ${order.externalOrderId}:`,
                stockErr,
              );
            }
            savedCount++;
            if (newStatus === "delivered") {
              amazonShippedReconciliation.delivered++;
            }
          } else {
            amazonShippedReconciliation.unchanged++;
          }

          await sleep(AMAZON_ORDER_DETAIL_DELAY_MS);
        } catch (err) {
          amazonShippedReconciliation.failed++;
          logger.error(
            `[Amazon Sync] Failed to reconcile shipped order ${order.externalOrderId}:`,
            err,
          );
        }
      }
    } catch (err) {
      logger.error("[Amazon Sync] Failed to reconcile shipped orders:", err);
    }

    logger.info("[Amazon Sync] Shipped order reconciliation complete", {
      channelId,
      ...amazonShippedReconciliation,
    });

    const financeReconciliation = await syncAmazonOrderFinances(userId, channelId).catch((err) => {
      logger.error("[Amazon Sync] Finance reconciliation failed:", err);
      return {
        checked: 0,
        synced: 0,
        noData: 0,
        failed: 1,
        notSupported: 0,
      };
    });

    return {
      fetched: fetchedCount,
      saved: savedCount,
      financeReconciliation,
      amazonShippedReconciliation,
    };
  },

  async refreshOrders(userId: number, channelId: number, externalOrderIds: string[]): Promise<OrderFetchResult> {
    const { db } = await import("@/db");
    const { channels, salesOrders } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { decryptChannelCredentials } = await import("@/lib/channels/utils");

    const uniqueOrderIds = [...new Set(externalOrderIds.filter(Boolean))];
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
    if (channel.channelType !== "amazon") throw new Error("Channel is not an Amazon channel");

    const creds = await decryptChannelCredentials(channel.credentials);
    const client = new AmazonAPIClient(creds, channel.storeUrl || "");
    let fetched = 0;
    let saved = 0;

    for (const externalOrderId of uniqueOrderIds) {
      try {
        const latestOrder = await client.getOrder(externalOrderId);
        fetched++;
        if (!latestOrder) continue;

        const [existing] = await db
          .select({
            id: salesOrders.id,
            status: salesOrders.status,
            purchasedAt: salesOrders.purchasedAt,
            buyerName: salesOrders.buyerName,
            rawData: salesOrders.rawData,
          })
          .from(salesOrders)
          .where(and(eq(salesOrders.channelId, channelId), eq(salesOrders.externalOrderId, externalOrderId)))
          .limit(1);

        if (!existing) continue;

        const newStatus = mapAmazonOrderStatus(latestOrder);
        const mergedRawData = {
          ...((existing.rawData as Record<string, unknown>) || {}),
          lastAmzUpdate: latestOrder,
        };
        const resolvedBuyerName = latestOrder.BuyerInfo?.BuyerName || null;

        await db
          .update(salesOrders)
          .set({
            status: newStatus,
            previousStatus: existing.status !== newStatus ? existing.status : undefined,
            rawData: mergedRawData,
            syncedAt: new Date(),
            ...(latestOrder.OrderTotal?.Amount ? { totalAmount: latestOrder.OrderTotal.Amount } : {}),
            ...(latestOrder.OrderTotal?.CurrencyCode ? { currency: latestOrder.OrderTotal.CurrencyCode } : {}),
            ...(resolvedBuyerName && !existing.buyerName ? { buyerName: resolvedBuyerName } : {}),
          })
          .where(eq(salesOrders.id, existing.id));

        if (existing.status !== newStatus) {
          try {
            const { processOrderStockChange, STOCK_CUTOFF_DATE } = await import("@/lib/stock/service");
            if (existing.purchasedAt && existing.purchasedAt >= STOCK_CUTOFF_DATE) {
              await processOrderStockChange(existing.id, newStatus, existing.status, userId);
            }
          } catch (stockErr) {
            logger.error(`[Amazon Sync] Stock processing failed for selected order ${externalOrderId}:`, stockErr);
          }
        }

        saved++;
        await sleep(AMAZON_ORDER_DETAIL_DELAY_MS);
      } catch (err) {
        logger.error(`[Amazon Sync] Failed to refresh selected order ${externalOrderId}:`, err);
      }
    }

    return { fetched, saved };
  },

  async syncOrderFinances(userId, channelId, options) {
    return syncAmazonOrderFinances(userId, channelId, options);
  },
};

function mapAmazonOrderStatus(order: Pick<AmazonOrder, "OrderStatus" | "EasyShipShipmentStatus">): SalesOrderStatus {
  if (order.EasyShipShipmentStatus === "Delivered") return "delivered";
  if (
    order.EasyShipShipmentStatus === "ReturnedToSeller" ||
    order.EasyShipShipmentStatus === "ReturningToSeller" ||
    order.EasyShipShipmentStatus === "RejectedByBuyer"
  ) {
    return "returned";
  }
  return mapAmazonStatus(order.OrderStatus);
}

function mapAmazonStatus(
  status: string | undefined,
): SalesOrderStatus {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const __amazonOrderStatusForTest = {
  mapAmazonOrderStatus,
};
