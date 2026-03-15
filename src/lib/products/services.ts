import { db } from "@/db";
import { products, channels, channelProductMappings, channelProducts } from "@/db/schema";
import { and, eq, sql, ilike, or } from "drizzle-orm";
import { getChannelHandler } from "@/lib/channels/handlers";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import type { ExternalProduct } from "@/lib/channels/types";

export type ChannelProductWithState = ExternalProduct & {
  mappingState:
    | { kind: "unmapped" }
    | { kind: "mapped_here" }
    | { kind: "mapped_other"; productId: number; productName: string };
};

export async function pushProductStockToChannelsService(userId: number, productId: number) {
  const productRows = await db
    .select({ quantityOnHand: products.quantityOnHand })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (productRows.length === 0) throw new Error("Product not found.");

  const quantity = productRows[0].quantityOnHand;

  const mappings = await db
    .select({
      mappingId: channelProductMappings.id,
      channelId: channelProductMappings.channelId,
      externalProductId: channelProductMappings.externalProductId,
      label: channelProductMappings.label,
      channelType: channels.channelType,
      storeUrl: channels.storeUrl,
      credentials: channels.credentials,
      channelName: channels.name,
      status: channels.status,
    })
    .from(channelProductMappings)
    .innerJoin(channels, eq(channelProductMappings.channelId, channels.id))
    .where(
      and(
        eq(channelProductMappings.productId, productId),
        eq(channels.userId, userId),
        eq(channels.status, "connected"),
      ),
    );

  if (mappings.length === 0) {
    return { success: true, results: [], message: "No channel mappings found.", quantity };
  }

  const results: Array<{
    channelName: string;
    externalProductId: string;
    label: string | null;
    ok: boolean;
    error?: string;
  }> = [];

  for (const m of mappings) {
    const handler = getChannelHandler(m.channelType);
    if (!handler || !m.storeUrl) {
      results.push({ channelName: m.channelName, externalProductId: m.externalProductId, label: m.label, ok: false, error: "Handler or store URL not available." });
      continue;
    }

    const decryptedCreds = decryptChannelCredentials(m.credentials);

    if (Object.keys(decryptedCreds).length === 0) {
      results.push({ channelName: m.channelName, externalProductId: m.externalProductId, label: m.label, ok: false, error: "Missing credentials." });
      continue;
    }

    if (!handler.capabilities.canPushStock || !handler.pushStock) {
      results.push({ channelName: m.channelName, externalProductId: m.externalProductId, label: m.label, ok: false, error: "This channel does not support stock push." });
      continue;
    }

    try {
      await handler.pushStock(m.storeUrl, decryptedCreds, m.externalProductId, quantity);
      results.push({ channelName: m.channelName, externalProductId: m.externalProductId, label: m.label, ok: true });
    } catch (err) {
      const msg = String(err).replace(/^Error:\s*/, "").substring(0, 200);
      results.push({ channelName: m.channelName, externalProductId: m.externalProductId, label: m.label, ok: false, error: msg });
    }
  }

  return { success: true, results, quantity };
}

export async function fetchChannelProductsService(
  userId: number,
  channelId: number,
  productId: number,
  search?: string,
): Promise<ChannelProductWithState[]> {
  const channelRows = await db
    .select({
      id: channels.id,
      status: channels.status,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (channelRows.length === 0) throw new Error("Channel not found.");
  const channel = channelRows[0];
  if (channel.status !== "connected") throw new Error("Channel is not connected.");

  const query = db
    .select({
      id: channelProducts.externalId,
      name: channelProducts.name,
      sku: channelProducts.sku,
      stockQuantity: channelProducts.stockQuantity,
      type: channelProducts.type,
      rawPayload: channelProducts.rawData,
      parentId: sql<string | null>`COALESCE(raw_data->>'parentId', CAST(raw_data->>'parent_id' AS TEXT))`,
    })
    .from(channelProducts)
    .where(
      and(
        eq(channelProducts.channelId, channelId),
        search && search.trim() !== ""
          ? or(
              ilike(channelProducts.name, `%${search}%`),
              ilike(channelProducts.sku, `%${search}%`)
            )
          : undefined
      )
    )
    .orderBy(channelProducts.externalId)
    .limit(2000);

  let externalProducts: ExternalProduct[];
  try {
    const rows = await query;
    externalProducts = rows.map((r) => ({
      ...r,
      sku: r.sku || undefined,
      stockQuantity: r.stockQuantity ?? undefined,
      type: (r.type as ExternalProduct["type"]) || "simple",
      parentId: r.parentId ?? undefined,
      rawPayload: r.rawPayload as Record<string, unknown>,
    }));
  } catch (err) {
    console.error("[fetchChannelProductsService] db query error", { channelId, error: String(err) });
    throw new Error("Unable to load cached products. Did you sync first?");
  }

  const existingMappings = await db
    .select({
      externalProductId: channelProductMappings.externalProductId,
      productId: channelProductMappings.productId,
      productName: products.name,
    })
    .from(channelProductMappings)
    .innerJoin(products, eq(channelProductMappings.productId, products.id))
    .where(eq(channelProductMappings.channelId, channelId));

  const mappingByExternalId = new Map(
    existingMappings.map((m) => [m.externalProductId, { productId: m.productId, productName: m.productName }]),
  );

  return externalProducts.map((p): ChannelProductWithState => {
    const existing = mappingByExternalId.get(p.id);
    if (!existing) {
      return { ...p, mappingState: { kind: "unmapped" } };
    }
    if (existing.productId === productId) {
      return { ...p, mappingState: { kind: "mapped_here" } };
    }
    return { ...p, mappingState: { kind: "mapped_other", productId: existing.productId, productName: existing.productName } };
  });
}

export async function saveChannelMappingsService(
  userId: number,
  productId: number,
  channelId: number,
  items: { externalProductId: string; label: string }[],
) {
  if (items.length === 0) return { added: 0, skipped: 0 };

  const channelRow = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
    .limit(1);

  if (channelRow.length === 0) throw new Error("Channel not found.");

  let added = 0;
  let skipped = 0;

  for (const item of items) {
    try {
      const result = await db
        .insert(channelProductMappings)
        .values({
          channelId,
          productId,
          externalProductId: item.externalProductId,
          label: item.label || null,
        })
        .onConflictDoNothing()
        .returning({ id: channelProductMappings.id });
      if (result.length > 0) {
        added++;
      } else {
        skipped++;
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        throw new Error(`WC product ${item.externalProductId} is already mapped to another product.`);
      }
      throw err;
    }
  }

  return { added, skipped };
}
