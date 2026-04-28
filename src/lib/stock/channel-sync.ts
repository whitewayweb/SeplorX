import { db } from "@/db";
import { channelProductMappings } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getChannelHandler } from "@/lib/channels/handlers";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import {
  getProductQuantity,
  getChannelMappingsForStockPush,
} from "@/data/products";

export interface StockPushItemResult {
  mappingId: number;
  channelName: string;
  externalProductId: string;
  label: string | null;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface StockPushProductResult {
  productId: number;
  quantity: number;
  results: StockPushItemResult[];
}

export async function pushProductStockToChannelsService(
  userId: number,
  productId: number,
): Promise<StockPushProductResult> {
  const quantity = await getProductQuantity(productId);
  if (quantity === null) throw new Error("Product not found.");

  const mappings = await getChannelMappingsForStockPush(userId, productId);
  const results: StockPushItemResult[] = [];
  const decryptedCredsCache = new Map<string, Record<string, string>>();

  for (const m of mappings) {
    const handler = getChannelHandler(m.channelType);
    if (!handler || !m.storeUrl) {
      results.push({
        mappingId: m.mappingId,
        channelName: m.channelName,
        externalProductId: m.externalProductId,
        label: m.label,
        ok: false,
        error: "Handler or store URL not available.",
      });
      continue;
    }

    const credsKey = JSON.stringify(m.credentials);
    let decryptedCreds = decryptedCredsCache.get(credsKey);
    if (!decryptedCreds) {
      decryptedCreds = await decryptChannelCredentials(m.credentials);
      decryptedCredsCache.set(credsKey, decryptedCreds);
    }

    if (Object.keys(decryptedCreds).length === 0) {
      results.push({
        mappingId: m.mappingId,
        channelName: m.channelName,
        externalProductId: m.externalProductId,
        label: m.label,
        ok: false,
        error: "Missing credentials.",
      });
      continue;
    }

    if (!handler.capabilities.canPushStock || !handler.pushStock) {
      results.push({
        mappingId: m.mappingId,
        channelName: m.channelName,
        externalProductId: m.externalProductId,
        label: m.label,
        ok: false,
        skipped: true,
        error: "This channel does not support stock push.",
      });
      continue;
    }

    try {
      await handler.pushStock(
        m.storeUrl,
        decryptedCreds,
        m.externalProductId,
        quantity,
        m.parentId,
        m.channelSku,
        m.productType,
        m.rawData as Record<string, unknown> | null,
      );
      results.push({
        mappingId: m.mappingId,
        channelName: m.channelName,
        externalProductId: m.externalProductId,
        label: m.label,
        ok: true,
      });
    } catch (err) {
      const msg = String(err).replace(/^Error:\s*/, "").substring(0, 200);
      results.push({
        mappingId: m.mappingId,
        channelName: m.channelName,
        externalProductId: m.externalProductId,
        label: m.label,
        ok: false,
        error: msg,
      });
    }
  }

  await persistStockPushResults(results);

  return { productId, quantity, results };
}

export async function pushBulkProductStockToChannelsService(
  userId: number,
  productIds: number[],
): Promise<StockPushProductResult[]> {
  const uniqueProductIds = Array.from(new Set(productIds.filter((id) => Number.isInteger(id) && id > 0)));
  const results: StockPushProductResult[] = [];

  for (const productId of uniqueProductIds) {
    results.push(await pushProductStockToChannelsService(userId, productId));
  }

  return results;
}

async function persistStockPushResults(results: StockPushItemResult[]) {
  const successIds = results.filter((r) => r.ok).map((r) => r.mappingId);
  const failed = results.filter((r) => !r.ok && !r.skipped);

  if (successIds.length > 0) {
    await db
      .update(channelProductMappings)
      .set({ syncStatus: "in_sync", lastSyncError: null })
      .where(inArray(channelProductMappings.id, successIds));
  }

  for (const failure of failed) {
    await db
      .update(channelProductMappings)
      .set({
        syncStatus: "failed",
        lastSyncError: failure.error ?? "Failed to push stock.",
      })
      .where(eq(channelProductMappings.id, failure.mappingId));
  }
}
