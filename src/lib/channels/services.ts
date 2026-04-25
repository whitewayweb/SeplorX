import { db } from "@/db";
import {
  channels,
  channelProducts,
  channelProductMappings,
  channelProductChangelog,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, encryptSync } from "@/lib/crypto";
import { getChannelById } from "@/lib/channels/registry";
import { getChannelHandler } from "@/lib/channels/handlers";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import {
  upsertChannelProducts,
  upsertProductWithVariationsTx,
} from "@/lib/channels/queries";
import type { ChannelType, ChannelPushSyncResult } from "@/lib/channels/types";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export async function createChannelService(
  userId: number,
  data: {
    channelType: string;
    name: string;
    storeUrl?: string;
    defaultPickupLocation?: string;
  },
  rawConfig: Record<string, string>,
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
        credentials[key] = await encrypt(val);
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
  rawConfig: Record<string, string>,
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
      // Merge current decrypted credentials with new non-empty values for validation
      const currentConfig: Record<string, string> = {
        ...(await decryptChannelCredentials(existingChannel.credentials as Record<string, unknown> || {})),
        storeUrl: existingChannel.storeUrl || "",
      };
      
      const mergedConfig = { ...currentConfig };
      for (const [key, val] of Object.entries(rawConfig)) {
        if (typeof val === "string" && val.trim() !== "") {
          mergedConfig[key] = val.trim();
        }
      }

      const configError = channelDef.validateConfig(mergedConfig);
      if (configError) throw new Error(configError);
    }

    for (const field of channelDef.configFields) {
      const val = rawConfig[field.key];
      if (typeof val === "string" && val.trim() !== "") {
        if (field.key === "storeUrl") {
          storeUrl = val.trim();
        } else {
          newCredentials[field.key] = await encrypt(val.trim());
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

export async function resetChannelStatusService(
  userId: number,
  channelId: number,
) {
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

export async function disconnectChannelService(
  userId: number,
  channelId: number,
) {
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

export async function registerChannelWebhooksService(
  userId: number,
  channelId: number,
) {
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
  if (channel.status !== "connected")
    throw new Error("Channel is not connected.");
  if (!channel.storeUrl) throw new Error("Channel has no store URL.");

  const handler = getChannelHandler(channel.channelType);
  if (!handler) throw new Error("This channel type does not support webhooks.");
  if (!handler.capabilities.usesWebhooks || !handler.registerWebhooks) {
    throw new Error("This channel type does not use webhooks.");
  }

  const creds = (channel.credentials as Record<string, unknown>) ?? {};
  const decryptedCreds = await decryptChannelCredentials(creds);
  if (Object.keys(decryptedCreds).length === 0)
    throw new Error("Channel credentials are missing.");

  const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const webhookSig = encryptSync(String(channelId));
  const webhookBaseUrl = `${appUrl}/api/channels/${channel.channelType}/webhook/${channelId}?sig=${encodeURIComponent(webhookSig)}`;

  const { secret } = await handler.registerWebhooks(
    channel.storeUrl,
    decryptedCreds,
    webhookBaseUrl,
  );

  await db
    .update(channels)
    .set({
      credentials: {
        ...creds,
        webhookSecret: await encrypt(secret),
      },
      updatedAt: new Date(),
    })
    .where(eq(channels.id, channelId));
}

export async function syncChannelProductsService(
  userId: number,
  channelId: number,
) {
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
  if (channel.status !== "connected")
    throw new Error("Channel is not connected.");
  if (!channel.storeUrl) throw new Error("Channel has no store URL.");

  const handler = getChannelHandler(channel.channelType);
  if (
    !handler ||
    !handler.capabilities.canFetchProducts ||
    !handler.fetchProducts
  ) {
    throw new Error("This channel type does not support fetching products.");
  }

  const decryptedCreds = await decryptChannelCredentials(channel.credentials as Record<string, unknown>);
  if (Object.keys(decryptedCreds).length === 0)
    throw new Error("Channel credentials missing.");

  const externalProducts = await handler.fetchProducts(
    channel.storeUrl,
    decryptedCreds,
  );

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

export async function clearChannelProductsService(
  userId: number,
  channelId: number,
) {
  const rows = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (rows.length === 0) throw new Error("Channel not found.");

  await db
    .delete(channelProducts)
    .where(eq(channelProducts.channelId, channelId));
}

export async function getCatalogItemService(
  userId: number,
  channelId: number,
  asin: string,
) {
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
  if (channel.status !== "connected")
    throw new Error("Channel is not connected.");
  if (!channel.storeUrl) throw new Error("Channel has no store URL.");

  const handler = getChannelHandler(channel.channelType);
  if (!handler || !handler.getCatalogItem) {
    throw new Error(
      "This channel type does not support fetching catalog items.",
    );
  }

  const decryptedCreds = await decryptChannelCredentials(channel.credentials as Record<string, unknown>);
  if (Object.keys(decryptedCreds).length === 0)
    throw new Error("Channel credentials missing.");

  // For Amazon, we need the SKU and fulfillment channel to fetch FBA inventory.
  // Let's try to get them from the DB if they're already there.
  const existingProduct = await db
    .select({ sku: channelProducts.sku, rawData: channelProducts.rawData })
    .from(channelProducts)
    .where(
      and(
        eq(channelProducts.channelId, channelId),
        eq(channelProducts.externalId, asin),
      ),
    )
    .limit(1);

  const sku = existingProduct[0]?.sku || undefined;

  const product = await handler.getCatalogItem(
    channel.storeUrl,
    decryptedCreds,
    asin,
    sku,
  );

  // ── Extract and map child AND parent variations ─────────────────────────
  let childAsins: string[] = [];
  let parentAsin: string | undefined = undefined;

  if (handler.extractRelationships) {
    try {
      const rels = handler.extractRelationships(product.rawPayload);

      childAsins = rels.childIds.filter((id) => id !== asin);
      if (childAsins.length > 0) {
        product.type = "variable";
      }

      const pa = rels.parentId;
      if (pa && pa !== asin) {
        parentAsin = pa;
        product.type = "variation";
        product.parentId = parentAsin;
      }
    } catch (err) {
      logger.warn("[getCatalogItemService] Failed to map variations", {
        action: "mapVariations",
        error: String(err),
      });
    }
  }

  // If this item is a Variation but the parent doesn't exist in the DB, it will become invisible.
  // We MUST proactively stage a Virtual Parent row into the DB first!
  if (parentAsin) {
    await db
      .insert(channelProducts)
      .values({
        channelId,
        externalId: parentAsin,
        name: `Variation Family: ${parentAsin}`,
        type: "variable",
        rawData: {},
        lastSyncedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [channelProducts.channelId, channelProducts.externalId],
      });
  }

  // Upsert into channel_products cache in a transaction
  await upsertProductWithVariationsTx(
    {
      channelId,
      externalId: asin,
      name: product.name,
      sku: product.sku || null,
      stockQuantity: product.stockQuantity ?? null,
      type: product.type || null,
      rawData: {
        ...product.rawPayload,
        parentId: product.parentId || parentAsin,
      },
    },
    childAsins,
  );

  return product;
}

/**
 * Handles the edit-product-drawer save in a channel-agnostic way.
 * Verifies ownership, reads existing rawData, delegates channel-specific
 * rawData patching to the handler's mergeProductUpdate(), writes the DB,
 * and stages the mapping for provider sync.
 */
export interface ChannelProductUpdatePatch {
  name?: string;
  sku?: string;
  stockQuantity?: number | null;
  price?: string;
  itemCondition?: string;
  description?: string;
  brand?: string;
  manufacturer?: string;
  partNumber?: string;
  color?: string;
  itemTypeKw?: string;
  pkgWeight?: string;
  itemWeight?: string;
}

// Fields that correspond to columns in the channel_products table.
// Everything else in a patch is treated as channel-specific rawData.
const CHANNEL_PRODUCT_DB_COLUMNS = ["name", "sku", "stockQuantity"] as const;

export async function updateChannelProductService(
  userId: number,
  channelId: number,
  productId: number,
  externalId: string,
  patch: ChannelProductUpdatePatch,
): Promise<void> {
  // Verify channel ownership
  const [channel] = await db
    .select({ id: channels.id, channelType: channels.channelType })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (!channel) throw new Error("Channel not found or unauthorized.");

  // Check if mapping exists BEFORE making local updates
  const [mapping] = await db
    .select({ id: channelProductMappings.id })
    .from(channelProductMappings)
    .where(
      and(
        eq(channelProductMappings.channelId, channelId),
        eq(channelProductMappings.externalProductId, externalId),
      ),
    )
    .limit(1);

  if (!mapping) {
    throw new Error(
      "Product must be mapped to a SeplorX inventory item before it can be updated.",
    );
  }

  // Read existing state
  const [existing] = await db
    .select({
      name: channelProducts.name,
      sku: channelProducts.sku,
      stockQuantity: channelProducts.stockQuantity,
      rawData: channelProducts.rawData,
    })
    .from(channelProducts)
    .where(
      and(
        eq(channelProducts.id, productId),
        eq(channelProducts.channelId, channelId),
        eq(channelProducts.externalId, externalId),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Channel product not found.");
  const existingRawData = (existing.rawData as Record<string, unknown>) ?? {};

  // Build DB patch and separate raw data fields
  const dbPatch: Record<string, unknown> = {};
  const rawPatch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    if ((CHANNEL_PRODUCT_DB_COLUMNS as readonly string[]).includes(key)) {
      if (value !== undefined) {
        dbPatch[key] = typeof value === "string" ? value.trim() : value;
      }
    } else {
      rawPatch[key] = value;
    }
  }

  // Delegate rawData merge to the channel handler
  const handler = getChannelHandler(channel.channelType);
  if (handler?.mergeProductUpdate && Object.keys(rawPatch).length > 0) {
    const rawDataMerge = handler.mergeProductUpdate(existingRawData, rawPatch);
    if (rawDataMerge && Object.keys(rawDataMerge).length > 0) {
      dbPatch.rawData = { ...existingRawData, ...rawDataMerge };
    }
  }

  // ── Compute delta: only fields that actually changed ───────────────────
  const delta: Record<string, unknown> = {};

  if (dbPatch.name !== undefined && dbPatch.name !== existing.name) {
    delta.name = dbPatch.name;
  }
  if (dbPatch.sku !== undefined && dbPatch.sku !== existing.sku) {
    delta.sku = dbPatch.sku;
  }
  if (
    dbPatch.stockQuantity !== undefined &&
    dbPatch.stockQuantity !== existing.stockQuantity
  ) {
    delta.stockQuantity = dbPatch.stockQuantity;
  }
  // For rawData changes, extract only the individual rawData fields that differ
  if (dbPatch.rawData) {
    for (const [key, newVal] of Object.entries(dbPatch.rawData)) {
      if (JSON.stringify(newVal) !== JSON.stringify(existingRawData[key])) {
        delta[key] = newVal;
      }
    }
  }

  // Persist local overrides, stage for sync, and append changelog atomically
  await db.transaction(async (tx) => {
    if (Object.keys(dbPatch).length > 0) {
      await tx
        .update(channelProducts)
        .set(dbPatch)
        .where(
          and(
            eq(channelProducts.id, productId),
            eq(channelProducts.channelId, channelId),
            eq(channelProducts.externalId, externalId),
          ),
        );
    }

    // Only update mapping and changelog if something actually changed
    if (Object.keys(delta).length > 0) {
      await tx
        .update(channelProductMappings)
        .set({ syncStatus: "pending_update", lastSyncError: null })
        .where(eq(channelProductMappings.id, mapping.id));

      const [existingStaged] = await tx
        .select({
          id: channelProductChangelog.id,
          delta: channelProductChangelog.delta,
        })
        .from(channelProductChangelog)
        .where(
          and(
            eq(channelProductChangelog.channelId, channelId),
            eq(channelProductChangelog.channelProductId, productId),
            eq(channelProductChangelog.status, "staged"),
          ),
        )
        .limit(1);

      if (existingStaged) {
        // Merge with existing staged delta
        const mergedDelta = {
          ...(existingStaged.delta as Record<string, unknown>),
          ...delta,
        };
        await tx
          .update(channelProductChangelog)
          .set({ delta: mergedDelta })
          .where(eq(channelProductChangelog.id, existingStaged.id));
      } else {
        // Insert new staged row
        await tx.insert(channelProductChangelog).values({
          channelId,
          channelProductId: productId,
          externalProductId: externalId,
          delta,
          status: "staged",
        });
      }
    }
  });
}

/**
 * Generic orchestrator for pushing staged product updates to any channel.
 *
 * Resolves the channel's handler via the handler registry and delegates
 * entirely to handler.pushPendingUpdates(). No channel-type switch needed here
 * or anywhere in application code — adding a new channel only requires
 * implementing pushPendingUpdates() on the handler.
 */
export async function pushChannelProductUpdatesService(
  userId: number,
  channelId: number,
): Promise<ChannelPushSyncResult> {
  // Verify ownership + resolve channel type
  const [channel] = await db
    .select({
      id: channels.id,
      channelType: channels.channelType,
      status: channels.status,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (!channel) throw new Error("Channel not found.");
  if (channel.status !== "connected")
    throw new Error("Channel is not connected.");

  const handler = getChannelHandler(channel.channelType);
  if (!handler)
    throw new Error(
      `No handler registered for channel type "${channel.channelType}".`,
    );
  if (
    !handler.capabilities.canPushProductUpdates ||
    !handler.pushPendingUpdates
  ) {
    throw new Error(
      `Channel type "${channel.channelType}" does not support direct product update sync.`,
    );
  }

  return handler.pushPendingUpdates(userId, channelId);
}
