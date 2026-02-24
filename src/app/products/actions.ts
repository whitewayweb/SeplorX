"use server";

import { db } from "@/db";
import { products, inventoryTransactions, channels, channelProductMappings } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductIdSchema,
  StockAdjustmentSchema,
} from "@/lib/validations/products";
import { ChannelMappingIdSchema } from "@/lib/validations/channels";
import { getChannelHandler } from "@/lib/channels/registry";
import { decrypt } from "@/lib/crypto";
import type { ExternalProduct } from "@/lib/channels/types";

// TODO: replace with auth() when auth is re-added
const CURRENT_USER_ID = 1;

export async function createProduct(_prevState: unknown, formData: FormData) {
  const parsed = CreateProductSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    description: formData.get("description"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    purchasePrice: formData.get("purchasePrice"),
    sellingPrice: formData.get("sellingPrice"),
    reorderLevel: formData.get("reorderLevel"),
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { purchasePrice, sellingPrice, ...rest } = parsed.data;

  try {
    await db.insert(products).values({
      ...rest,
      purchasePrice: purchasePrice != null && purchasePrice !== "" ? String(purchasePrice) : null,
      sellingPrice: sellingPrice != null && sellingPrice !== "" ? String(sellingPrice) : null,
    });
  } catch (err) {
    console.error("[createProduct]", { error: String(err) });
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "23505"
    ) {
      const existing = await db
        .select({ id: products.id, name: products.name, sku: products.sku, purchasePrice: products.purchasePrice, unit: products.unit })
        .from(products)
        .where(eq(products.sku, rest.sku || ""))
        .limit(1);
      return { 
        error: "A product with this SKU already exists.", 
        existingProduct: existing.length > 0 ? existing[0] : null 
      };
    }
    return { error: "Failed to create product. Please try again." };
  }

  revalidatePath("/products");
  revalidatePath("/purchase/bills");
  return { success: true };
}

export async function updateProduct(_prevState: unknown, formData: FormData) {
  const parsed = UpdateProductSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    sku: formData.get("sku"),
    description: formData.get("description"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    purchasePrice: formData.get("purchasePrice"),
    sellingPrice: formData.get("sellingPrice"),
    reorderLevel: formData.get("reorderLevel"),
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, purchasePrice, sellingPrice, ...rest } = parsed.data;

  try {
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (existing.length === 0) {
      return { error: "Product not found." };
    }

    await db
      .update(products)
      .set({
        ...rest,
        purchasePrice: purchasePrice != null && purchasePrice !== "" ? String(purchasePrice) : null,
        sellingPrice: sellingPrice != null && sellingPrice !== "" ? String(sellingPrice) : null,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id));
  } catch (err) {
    console.error("[updateProduct]", { productId: id, error: String(err) });
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "23505"
    ) {
      return { error: "A product with this SKU already exists." };
    }
    return { error: "Failed to update product. Please try again." };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  return { success: true };
}

export async function toggleProductActive(_prevState: unknown, formData: FormData) {
  const parsed = ProductIdSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { error: "Invalid product ID." };
  }

  const { id } = parsed.data;

  try {
    const existing = await db
      .select({ id: products.id, isActive: products.isActive })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (existing.length === 0) {
      return { error: "Product not found." };
    }

    await db
      .update(products)
      .set({ isActive: !existing[0].isActive, updatedAt: new Date() })
      .where(eq(products.id, id));
  } catch (err) {
    console.error("[toggleProductActive]", { productId: id, error: String(err) });
    return { error: "Failed to update product status. Please try again." };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  return { success: true };
}

export async function deleteProduct(_prevState: unknown, formData: FormData) {
  const parsed = ProductIdSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { error: "Invalid product ID." };
  }

  const { id } = parsed.data;

  try {
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (existing.length === 0) {
      return { error: "Product not found." };
    }

    await db.delete(products).where(eq(products.id, id));
  } catch (err) {
    console.error("[deleteProduct]", { productId: id, error: String(err) });
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "23503"
    ) {
      return { error: "Cannot delete product with existing invoices or inventory records. Deactivate instead." };
    }
    return { error: "Failed to delete product. Please try again." };
  }

  revalidatePath("/products");
  return { success: true };
}

export async function adjustStock(_prevState: unknown, formData: FormData) {
  const parsed = StockAdjustmentSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { productId, quantity, notes } = parsed.data;

  try {
    // Use a transaction to ensure stock check + update + log are atomic
    await db.transaction(async (tx) => {
      // Check product exists
      const existing = await tx
        .select({ id: products.id, quantityOnHand: products.quantityOnHand })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (existing.length === 0) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const newQty = existing[0].quantityOnHand + quantity;
      if (newQty < 0) {
        throw new Error(`INSUFFICIENT_STOCK:${existing[0].quantityOnHand}`);
      }

      // Atomically update stock and insert transaction log
      await tx
        .update(products)
        .set({
          quantityOnHand: sql`${products.quantityOnHand} + ${quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      await tx.insert(inventoryTransactions).values({
        productId,
        type: "adjustment",
        quantity,
        referenceType: "manual",
        notes: notes || null,
        createdBy: CURRENT_USER_ID,
      });
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("PRODUCT_NOT_FOUND")) {
      return { error: "Product not found." };
    }
    if (message.includes("INSUFFICIENT_STOCK:")) {
      const currentQty = message.split("INSUFFICIENT_STOCK:")[1];
      return { error: `Insufficient stock. Current: ${currentQty}, adjustment: ${quantity}.` };
    }
    console.error("[adjustStock]", { productId, quantity, error: message });
    return { error: "Failed to adjust stock. Please try again." };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath("/inventory");
  return { success: true };
}

// ─── Channel Product Mappings ─────────────────────────────────────────────────

export async function deleteChannelMapping(_prevState: unknown, formData: FormData) {
  const parsed = ChannelMappingIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid mapping ID." };

  try {
    // Verify ownership via join
    const rows = await db
      .select({ productId: channelProductMappings.productId })
      .from(channelProductMappings)
      .innerJoin(channels, eq(channelProductMappings.channelId, channels.id))
      .where(
        and(
          eq(channelProductMappings.id, parsed.data.id),
          eq(channels.userId, CURRENT_USER_ID),
        ),
      )
      .limit(1);

    if (rows.length === 0) return { error: "Mapping not found." };

    await db
      .delete(channelProductMappings)
      .where(eq(channelProductMappings.id, parsed.data.id));

    revalidatePath(`/products/${rows[0].productId}`);
  } catch (err) {
    console.error("[deleteChannelMapping]", { id: parsed.data.id, error: String(err) });
    return { error: "Failed to delete mapping." };
  }

  return { success: true };
}

/**
 * Push the current SeplorX stock quantity to all mapped WooCommerce products
 * for the given product. Returns per-channel results.
 * Called from the "Push to All Channels" button on the product detail page.
 */
export async function pushProductStockToChannels(productId: number) {
  try {
    const productRows = await db
      .select({ quantityOnHand: products.quantityOnHand })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (productRows.length === 0) return { error: "Product not found." };

    const quantity = productRows[0].quantityOnHand;

    // Fetch all mappings for this product, joined with their channel details
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
          eq(channels.userId, CURRENT_USER_ID),
          eq(channels.status, "connected"),
        ),
      );

    if (mappings.length === 0) {
      return { success: true, results: [], message: "No channel mappings found." };
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

      const creds = m.credentials ?? {};
      const consumerKey = creds.consumerKey ? decrypt(creds.consumerKey) : "";
      const consumerSecret = creds.consumerSecret ? decrypt(creds.consumerSecret) : "";

      if (!consumerKey || !consumerSecret) {
        results.push({ channelName: m.channelName, externalProductId: m.externalProductId, label: m.label, ok: false, error: "Missing credentials." });
        continue;
      }

      try {
        await handler.pushStock(m.storeUrl, { consumerKey, consumerSecret }, m.externalProductId, quantity);
        results.push({ channelName: m.channelName, externalProductId: m.externalProductId, label: m.label, ok: true });
      } catch (err) {
        const msg = String(err).replace(/^Error:\s*/, "").substring(0, 200);
        results.push({ channelName: m.channelName, externalProductId: m.externalProductId, label: m.label, ok: false, error: msg });
      }
    }

    return { success: true, results, quantity };
  } catch (err) {
    console.error("[pushProductStockToChannels]", { productId, error: String(err) });
    return { error: "Failed to push stock to channels." };
  }
}

// ─── Fetch channel products with mapping state ────────────────────────────────

export type ChannelProductWithState = ExternalProduct & {
  mappingState:
    | { kind: "unmapped" }
    | { kind: "mapped_here" }
    | { kind: "mapped_other"; productId: number; productName: string };
};

/**
 * Fetch products from the remote channel and enrich each with its mapping state
 * relative to the given SeplorX product (productId).
 *
 * - unmapped: not yet mapped to any SeplorX product on this channel
 * - mapped_here: already mapped to THIS product → shown checked + disabled
 * - mapped_other: mapped to a DIFFERENT SeplorX product → greyed, non-selectable
 */
export async function fetchChannelProducts(
  channelId: number,
  productId: number,
  search?: string,
): Promise<ChannelProductWithState[] | { error: string }> {
  // Verify channel belongs to current user and is connected
  const channelRows = await db
    .select({
      id: channels.id,
      channelType: channels.channelType,
      storeUrl: channels.storeUrl,
      credentials: channels.credentials,
      status: channels.status,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, CURRENT_USER_ID)))
    .limit(1);

  if (channelRows.length === 0) return { error: "Channel not found." };

  const channel = channelRows[0];
  if (channel.status !== "connected") {
    return { error: "Channel is not connected." };
  }

  const handler = getChannelHandler(channel.channelType);
  if (!handler || !handler.fetchProducts) {
    return { error: "This channel does not support product listing." };
  }

  if (!channel.storeUrl) {
    return { error: "Channel has no store URL configured." };
  }

  const creds = channel.credentials ?? {};
  const consumerKey = creds.consumerKey ? decrypt(creds.consumerKey) : "";
  const consumerSecret = creds.consumerSecret ? decrypt(creds.consumerSecret) : "";

  if (!consumerKey || !consumerSecret) {
    return { error: "Channel credentials are missing or invalid." };
  }

  let externalProducts: ExternalProduct[];
  try {
    externalProducts = await handler.fetchProducts(
      channel.storeUrl,
      { consumerKey, consumerSecret },
      search,
    );
  } catch (err) {
    console.error("[fetchChannelProducts] fetchProducts error", { channelId, error: String(err) });
    return { error: "Unable to load products from this channel." };
  }

  // Load all existing mappings for this channel (to determine state)
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

// ─── Batch save channel mappings ──────────────────────────────────────────────

/**
 * Bulk-insert channel product mappings selected via the dialog.
 * Uses INSERT ON CONFLICT DO NOTHING — safe to re-run (idempotent for same product).
 * The unique constraint (channel_id, external_product_id) blocks mapping a WC product
 * to a second SeplorX product — that path returns { error }.
 */
export async function saveChannelMappings(
  productId: number,
  channelId: number,
  items: { externalProductId: string; label: string }[],
): Promise<{ added: number; skipped: number } | { error: string }> {
  if (items.length === 0) return { added: 0, skipped: 0 };

  // Verify channel belongs to current user
  const channelRow = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, CURRENT_USER_ID)))
    .limit(1);

  if (channelRow.length === 0) return { error: "Channel not found." };

  let added = 0;
  let skipped = 0;

  try {
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
        // 23505 = unique_violation — WC product already mapped to a different SeplorX product
        if (code === "23505") {
          return { error: `WC product ${item.externalProductId} is already mapped to another product.` };
        }
        throw err;
      }
    }
  } catch (err) {
    console.error("[saveChannelMappings]", { channelId, productId, error: String(err) });
    return { error: "Failed to save mappings. Please try again." };
  }

  revalidatePath(`/products/${productId}`);
  return { added, skipped };
}
