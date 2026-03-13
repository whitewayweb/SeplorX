import { db } from "@/db";
import { channels, channelProducts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt } from "@/lib/crypto";
import { getChannelById } from "@/lib/channels/registry";
import { getChannelHandler } from "@/lib/channels/handlers";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import { upsertChannelProducts, upsertProductWithVariationsTx, updateChannelProductInDb } from "@/lib/channels/queries";
import type { ChannelType } from "@/lib/channels/types";
import { env } from "@/lib/env";

export async function createChannelService(
  userId: number,
  data: { channelType: string; name: string; storeUrl?: string; defaultPickupLocation?: string },
  rawConfig: Record<string, string>
) {
  const channelDef = getChannelById(data.channelType as ChannelType);

  if (!channelDef || !channelDef.available) {
    throw new Error("This channel type is not available.");
  }

  const credentials: Record<string, string> = {};
  let status: "pending" | "connected" | "disconnected" = "pending";

  if (channelDef.authType === "apikey" && channelDef.configFields) {
    if (channelDef.validateConfig) {
      const configError = channelDef.validateConfig(rawConfig);
      if (configError) throw new Error(configError);
    }

    status = "connected";
    for (const [key, val] of Object.entries(rawConfig)) {
      if (key !== "storeUrl") {
        credentials[key] = encrypt(val);
      }
    }
  }

  const [row] = await db
    .insert(channels)
    .values({
      userId,
      channelType: data.channelType,
      name: data.name,
      status,
      storeUrl: data.storeUrl || null,
      defaultPickupLocation: data.defaultPickupLocation || null,
      credentials,
    })
    .returning({ id: channels.id });

  return row.id;
}

export async function updateChannelService(
  userId: number,
  id: number,
  data: { name: string; defaultPickupLocation?: string },
  rawConfig: Record<string, string>
) {
  const existing = await db
    .select({
      id: channels.id,
      channelType: channels.channelType,
      credentials: channels.credentials,
      storeUrl: channels.storeUrl,
    })
    .from(channels)
    .where(and(eq(channels.id, id), eq(channels.userId, userId)))
    .limit(1);

  if (existing.length === 0) throw new Error("Channel not found.");
  const existingChannel = existing[0];
  const channelDef = getChannelById(existingChannel.channelType as ChannelType);

  let storeUrl = existingChannel.storeUrl;
  const newCredentials = { ...(existingChannel.credentials || {}) };

  if (channelDef?.configFields) {
    if (channelDef.validateConfig) {
      const configError = channelDef.validateConfig(rawConfig);
      if (configError) throw new Error(configError);
    }

    for (const field of channelDef.configFields) {
      const val = rawConfig[field.key];
      if (val && typeof val === "string" && val.trim() !== "") {
        if (field.key === "storeUrl") {
          storeUrl = val.trim();
        } else {
          newCredentials[field.key] = encrypt(val.trim());
        }
      }
    }
  }

  await db
    .update(channels)
    .set({
      name: data.name,
      defaultPickupLocation: data.defaultPickupLocation || null,
      storeUrl,
      credentials: newCredentials,
      updatedAt: new Date(),
    })
    .where(eq(channels.id, id));
}

export async function resetChannelStatusService(userId: number, channelId: number) {
  const [row] = await db
    .select({ id: channels.id, storeUrl: channels.storeUrl })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (!row) throw new Error("Channel not found.");

  await db
    .update(channels)
    .set({ status: "pending", credentials: {}, updatedAt: new Date() })
    .where(eq(channels.id, channelId));

  return row;
}

export async function disconnectChannelService(userId: number, channelId: number) {
  const existing = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (existing.length === 0) throw new Error("Channel not found.");

  await db
    .update(channels)
    .set({ status: "disconnected", credentials: {}, updatedAt: new Date() })
    .where(eq(channels.id, channelId));
}

export async function deleteChannelService(userId: number, channelId: number) {
  const existing = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (existing.length === 0) throw new Error("Channel not found.");

  await db.delete(channels).where(eq(channels.id, channelId));
}

export async function registerChannelWebhooksService(userId: number, channelId: number) {
  const rows = await db
    .select({
      id: channels.id,
      channelType: channels.channelType,
      storeUrl: channels.storeUrl,
      status: channels.status,
      credentials: channels.credentials,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (rows.length === 0) throw new Error("Channel not found.");

  const channel = rows[0];
  if (channel.status !== "connected") throw new Error("Channel is not connected.");
  if (!channel.storeUrl) throw new Error("Channel has no store URL.");

  const handler = getChannelHandler(channel.channelType);
  if (!handler) throw new Error("This channel type does not support webhooks.");
  if (!handler.capabilities.usesWebhooks || !handler.registerWebhooks) {
    throw new Error("This channel type does not use webhooks.");
  }

  const creds = channel.credentials ?? {};
  const decryptedCreds = decryptChannelCredentials(creds);
  if (Object.keys(decryptedCreds).length === 0) throw new Error("Channel credentials are missing.");

  const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const webhookBaseUrl = `${appUrl}/api/channels/${channel.channelType}/webhook/${channelId}`;

  const { secret } = await handler.registerWebhooks(
    channel.storeUrl,
    decryptedCreds,
    webhookBaseUrl,
  );

  await db
    .update(channels)
    .set({
      credentials: { ...creds, webhookSecret: encrypt(secret) },
      updatedAt: new Date(),
    })
    .where(eq(channels.id, channelId));
}

export async function syncChannelProductsService(userId: number, channelId: number) {
  const rows = await db
    .select({
      id: channels.id,
      channelType: channels.channelType,
      storeUrl: channels.storeUrl,
      credentials: channels.credentials,
      status: channels.status,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (rows.length === 0) throw new Error("Channel not found.");

  const channel = rows[0];
  if (channel.status !== "connected") throw new Error("Channel is not connected.");
  if (!channel.storeUrl) throw new Error("Channel has no store URL.");

  const handler = getChannelHandler(channel.channelType);
  if (!handler || !handler.capabilities.canFetchProducts || !handler.fetchProducts) {
    throw new Error("This channel type does not support fetching products.");
  }

  const decryptedCreds = decryptChannelCredentials(channel.credentials);
  if (Object.keys(decryptedCreds).length === 0) throw new Error("Channel credentials missing.");

  const externalProducts = await handler.fetchProducts(channel.storeUrl, decryptedCreds);

  if (externalProducts.length > 0) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < externalProducts.length; i += BATCH_SIZE) {
      const batch = externalProducts.slice(i, i + BATCH_SIZE).map((p) => ({
        channelId,
        externalId: p.id,
        name: p.name,
        sku: p.sku ?? null,
        stockQuantity: p.stockQuantity ?? null,
        type: p.type ?? null,
        rawData: { ...p.rawPayload, parentId: p.parentId },
      }));

      await upsertChannelProducts(batch);
    }
  }
  return externalProducts.length;
}

export async function clearChannelProductsService(userId: number, channelId: number) {
  const rows = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (rows.length === 0) throw new Error("Channel not found.");

  await db.delete(channelProducts).where(eq(channelProducts.channelId, channelId));
}

export async function getCatalogItemService(userId: number, channelId: number, asin: string) {
  const rows = await db
    .select({
      id: channels.id,
      channelType: channels.channelType,
      storeUrl: channels.storeUrl,
      credentials: channels.credentials,
      status: channels.status,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (rows.length === 0) throw new Error("Channel not found.");

  const channel = rows[0];
  if (channel.status !== "connected") throw new Error("Channel is not connected.");
  if (!channel.storeUrl) throw new Error("Channel has no store URL.");

  const handler = getChannelHandler(channel.channelType);
  if (!handler || !handler.getCatalogItem) {
    throw new Error("This channel type does not support fetching catalog items.");
  }

  const decryptedCreds = decryptChannelCredentials(channel.credentials);
  if (Object.keys(decryptedCreds).length === 0) throw new Error("Channel credentials missing.");

  // For Amazon, we need the SKU and fulfillment channel to fetch FBA inventory. 
  // Let's try to get them from the DB if they're already there.
  const existingProduct = await db
    .select({ sku: channelProducts.sku, rawData: channelProducts.rawData })
    .from(channelProducts)
    .where(and(eq(channelProducts.channelId, channelId), eq(channelProducts.externalId, asin)))
    .limit(1);
    
  const sku = existingProduct[0]?.sku || undefined;
  const rawData = existingProduct[0]?.rawData as Record<string, unknown> | undefined;
  const fulfillmentChannel = (rawData?.["fulfillment-channel"] as string) || undefined;

  const product = await handler.getCatalogItem(channel.storeUrl, decryptedCreds, asin, sku, fulfillmentChannel);

  // ── Extract and map child variations ─────────────────────────────────────
  // Amazon stores child ASINs in rawPayload.relationships. We collect all unique
  // childAsins from VARIATION relationships and natively update their existing DB rows
  // to set type="variation" and parentId, bypassing extra API fetches.
  const childAsinSet = new Set<string>();
  try {
    const relationships = product.rawPayload?.relationships as Array<{
      marketplaceId?: string;
      relationships?: Array<{ type?: string; childAsins?: string[] }>;
    }> | undefined;

    if (Array.isArray(relationships)) {
      for (const byMarketplace of relationships) {
        if (!Array.isArray(byMarketplace.relationships)) continue;
        for (const rel of byMarketplace.relationships) {
          if (rel.type === "VARIATION" && Array.isArray(rel.childAsins)) {
            for (const childAsin of rel.childAsins) {
              if (childAsin && childAsin !== asin) {
                childAsinSet.add(childAsin);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    // Don't fail the whole operation if child variation mapping fails
    console.warn("[getCatalogItemService] Failed to map child variations", { action: "mapChildVariations", error: String(err) });
  }

  const childAsins = [...childAsinSet];

  // Upsert into channel_products cache in a transaction
  await upsertProductWithVariationsTx({
    channelId,
    externalId: asin,
    name: product.name,
    sku: product.sku || null,
    stockQuantity: product.stockQuantity ?? null,
    type: product.type || null,
    rawData: { ...product.rawPayload, parentId: product.parentId },
  }, childAsins);

  return product;
}

// ─────────────────────────────────────────────────────────────────────────────
// updateChannelProductService
// ─────────────────────────────────────────────────────────────────────────────
// Handles the edit-product-drawer save flow in a channel-agnostic way:
//   1. Verifies channel ownership (auth guard)
//   2. Reads the existing rawData from the DB (needed for safe merge)
//   3. Delegates rawData patching to the channel's own mergeProductUpdate() hook
//      (keeps channel-specific rawData key names out of the shared service layer)
//   4. Writes only the submitted fields to channel_products via the DAL
//   5. Marks any matching channel_product_mappings row as pending_update so
//      the feeds generator picks it up on next provider sync
// ─────────────────────────────────────────────────────────────────────────────

export interface ChannelProductUpdatePatch {
  /** Only present when the "Product Details" tab was active */
  name?: string;
  /** Only present when the "Offer & Inventory" tab was active */
  sku?: string;
  stockQuantity?: number | null;
  price?: string;
  itemCondition?: string;
}

export async function updateChannelProductService(
  userId: number,
  channelId: number,
  productId: number,
  externalId: string,
  patch: ChannelProductUpdatePatch,
): Promise<void> {
  // ── 1. Verify channel ownership ──────────────────────────────────────────
  const channelRows = await db
    .select({ id: channels.id, channelType: channels.channelType })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (channelRows.length === 0) throw new Error("Channel not found or unauthorized.");
  const channelType = channelRows[0].channelType;

  // ── 2. Read existing rawData (needed so merge doesn't lose existing fields) ─
  const { channelProducts: cpTable, channelProductMappings } = await import("@/db/schema");
  const existing = await db
    .select({ rawData: cpTable.rawData })
    .from(cpTable)
    .where(eq(cpTable.id, productId))
    .limit(1);

  if (existing.length === 0) throw new Error("Channel product not found.");
  const existingRawData = (existing[0].rawData as Record<string, unknown>) ?? {};

  // ── 3. Build the update payload ──────────────────────────────────────────
  const dbPatch: Parameters<typeof updateChannelProductInDb>[1] = {};

  if (patch.name !== undefined && patch.name.trim()) {
    dbPatch.name = patch.name.trim();
  }
  if (patch.sku !== undefined) {
    dbPatch.sku = patch.sku.trim() || null;
  }
  if (patch.stockQuantity !== undefined) {
    dbPatch.stockQuantity = patch.stockQuantity;
  }

  // ── 4. Delegate rawData merge to the channel handler ─────────────────────
  // The handler knows its own rawData key conventions (e.g. Amazon uses
  // "item-condition", WooCommerce might use "sale_price"). If the handler
  // doesn't implement mergeProductUpdate, rawData is left unchanged.
  const handler = getChannelHandler(channelType);
  if (handler?.mergeProductUpdate) {
    const rawPatch: Record<string, string | undefined> = {};
    if (patch.price !== undefined) rawPatch.price = patch.price;
    if (patch.itemCondition !== undefined) rawPatch.itemCondition = patch.itemCondition;

    const rawDataMerge = handler.mergeProductUpdate(existingRawData, rawPatch);
    if (rawDataMerge && Object.keys(rawDataMerge).length > 0) {
      dbPatch.rawData = { ...existingRawData, ...rawDataMerge };
    }
  }

  // ── 5. Persist — only touches fields that are in dbPatch ─────────────────
  await updateChannelProductInDb(productId, dbPatch);

  // ── 6. Stage for provider sync ───────────────────────────────────────────
  // Mark the mapping as pending_update so the feeds generator picks it up.
  await db
    .update(channelProductMappings)
    .set({ syncStatus: "pending_update", lastSyncError: null })
    .where(
      and(
        eq(channelProductMappings.channelId, channelId),
        eq(channelProductMappings.externalProductId, externalId),
      ),
    );
}
