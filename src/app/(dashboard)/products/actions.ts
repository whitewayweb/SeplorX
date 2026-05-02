"use server";

import { db } from "@/db";
import { products, inventoryTransactions, channels, channelProductMappings, productBundles } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductIdSchema,
  StockAdjustmentSchema,
} from "@/lib/validations/products";
import { ChannelMappingIdSchema } from "@/lib/validations/channels";
import type { ExternalProduct } from "@/lib/channels/types";
import {
  getConnectedChannel,
  getProductById,
  getExternalProducts,
  getVariationsForParent,
  getExistingMappingsForChannel,
  insertChannelMappingQuietly,
  getUniqueAttributeKeys,
  getAttributeValues
} from "@/data/products";

export type ChannelProductWithState = ExternalProduct & {
  mappingState:
  | { kind: "unmapped" }
  | { kind: "mapped_here" }
  | { kind: "mapped_other"; productId: number; productName: string };
};
import { getAuthenticatedUserId } from "@/lib/auth";
import { triggerChannelSync } from "@/lib/stock/service";
import { pushProductStockToChannelsService } from "@/lib/stock/channel-sync";


export async function createProduct(_prevState: unknown, formData: FormData): Promise<{
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  existingProduct?: { id: number; name: string; sku: string | null; purchasePrice: string | null; unit: string } | null;
}> {
  const rawAttrs = formData.get("attributes");
  let parsedAttrs: Record<string, string> = {};
  if (rawAttrs && typeof rawAttrs === "string" && rawAttrs.trim()) {
    try { parsedAttrs = JSON.parse(rawAttrs); } catch { /* ignore invalid JSON */ }
  }

  const rawComponents = formData.get("components");
  let parsedComponents: { componentProductId: number; quantity: number }[] = [];
  if (rawComponents && typeof rawComponents === "string" && rawComponents.trim()) {
    try { parsedComponents = JSON.parse(rawComponents); } catch { /* ignore */ }
  }

  const parsed = CreateProductSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    description: formData.get("description"),
    category: formData.get("category"),
    attributes: parsedAttrs,
    unit: formData.get("unit"),
    purchasePrice: formData.get("purchasePrice"),
    sellingPrice: formData.get("sellingPrice"),
    reorderLevel: formData.get("reorderLevel"),
    isBundle: formData.get("isBundle") === "true",
    components: parsedComponents,
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let { purchasePrice, sellingPrice, isBundle, components, ...rest } = parsed.data;

  // For bundle products, force purchasePrice to null and quantityOnHand to 0
  if (isBundle) {
    purchasePrice = undefined;
  }

  try {
    return await db.transaction(async (tx) => {
      // Validate components: none can be bundles themselves (if nested bundles are unsupported)
      if (isBundle && components.length > 0) {
        const componentIds = components.map(c => c.componentProductId);
        const bundleComponents = await tx
          .select({ id: products.id })
          .from(products)
          .where(and(inArray(products.id, componentIds), eq(products.isBundle, true)));

        if (bundleComponents.length > 0) {
          return { error: "Nested bundles are not supported. Component products must be simple products." };
        }
      }

      const [newProduct] = await tx.insert(products).values({
        ...rest,
        isBundle,
        purchasePrice: purchasePrice != null && purchasePrice !== "" ? String(purchasePrice) : null,
        sellingPrice: sellingPrice != null && sellingPrice !== "" ? String(sellingPrice) : null,
        quantityOnHand: isBundle ? 0 : 0, // Bundles always have 0 on-hand, they are virtual
      }).returning({ id: products.id });

      if (isBundle && components.length > 0) {
        await tx.insert(productBundles).values(components.map((c, i) => ({
          bundleProductId: newProduct.id,
          componentProductId: c.componentProductId,
          quantity: c.quantity,
          sortOrder: i,
        })));
      }

      revalidatePath("/products");
      revalidatePath("/purchase/bills");
      console.log(`[createProduct] Product created successfully: ${rest.name} (${rest.sku || "no sku"})`);
      return { success: true };
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
}

export async function updateProduct(_prevState: unknown, formData: FormData): Promise<{
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}> {
  const rawAttrs = formData.get("attributes");
  let parsedAttrs: Record<string, string> = {};
  if (rawAttrs && typeof rawAttrs === "string" && rawAttrs.trim()) {
    try { parsedAttrs = JSON.parse(rawAttrs); } catch { /* ignore invalid JSON */ }
  }

  const rawComponents = formData.get("components");
  let parsedComponents: { componentProductId: number; quantity: number }[] = [];
  if (rawComponents && typeof rawComponents === "string" && rawComponents.trim()) {
    try { parsedComponents = JSON.parse(rawComponents); } catch { /* ignore */ }
  }

  const parsed = UpdateProductSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    sku: formData.get("sku"),
    description: formData.get("description"),
    category: formData.get("category"),
    attributes: parsedAttrs,
    unit: formData.get("unit"),
    purchasePrice: formData.get("purchasePrice"),
    sellingPrice: formData.get("sellingPrice"),
    reorderLevel: formData.get("reorderLevel"),
    isBundle: formData.get("isBundle") === "true",
    components: parsedComponents,
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let { id, purchasePrice, sellingPrice, isBundle, components, ...rest } = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: products.id, isBundle: products.isBundle })
        .from(products)
        .where(eq(products.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const currentProduct = existing[0];

      // Enforce bundle immutability: once a bundle, always a bundle
      if (currentProduct.isBundle) {
        isBundle = true;
      }

      // For bundle products, force purchasePrice to null
      if (isBundle) {
        purchasePrice = undefined;
      }

      // Validate components: none can be bundles themselves
      if (isBundle && components.length > 0) {
        const componentIds = components.map(c => c.componentProductId);
        const bundleComponents = await tx
          .select({ id: products.id })
          .from(products)
          .where(and(inArray(products.id, componentIds), eq(products.isBundle, true)));

        if (bundleComponents.length > 0) {
          return { error: "Nested bundles are not supported. Component products must be simple products." };
        }
      }

      await tx
        .update(products)
        .set({
          ...rest,
          isBundle,
          purchasePrice: purchasePrice != null && purchasePrice !== "" ? String(purchasePrice) : null,
          sellingPrice: sellingPrice != null && sellingPrice !== "" ? String(sellingPrice) : null,
          updatedAt: new Date(),
          // If it's a bundle, we ensure quantityOnHand is 0 (virtual)
          ...(isBundle ? { quantityOnHand: 0 } : {}),
        })
        .where(eq(products.id, id));

      // Handle bundles update
      await tx.delete(productBundles).where(eq(productBundles.bundleProductId, id));
      if (isBundle && components.length > 0) {
        await tx.insert(productBundles).values(components.map((c, i) => ({
          bundleProductId: id,
          componentProductId: c.componentProductId,
          quantity: c.quantity,
          sortOrder: i,
        })));
      }

      // Flag all channel mappings for this product as pending_update
      await triggerChannelSync(id, tx);

      revalidatePath("/products");
      revalidatePath(`/products/${id}`);
      console.log(`[updateProduct] Product updated successfully: ${id} - ${rest.name}`);
      return { success: true };
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("PRODUCT_NOT_FOUND")) {
      return { error: "Product not found." };
    }
    console.error("[updateProduct]", { productId: id, error: message });
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
}

export async function toggleProductActive(_prevState: unknown, formData: FormData): Promise<{ success?: boolean; error?: string }> {
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
  console.log(`[toggleProductActive] Product status toggled for id: ${id}`);
  return { success: true };
}

export async function deleteProduct(_prevState: unknown, formData: FormData): Promise<{ success?: boolean; error?: string; code?: string }> {
  const parsed = ProductIdSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { error: "Invalid product ID." };
  }

  const { id } = parsed.data;
  const force = formData.get("force") === "true";

  try {
    await db.transaction(async (tx) => {
      const product = await getProductById(id, tx);

      if (!product) {
        throw new Error("Product not found.");
      }

      const hasTransactions = await tx
        .select({ id: inventoryTransactions.id })
        .from(inventoryTransactions)
        .where(eq(inventoryTransactions.productId, id))
        .limit(1);

      if (hasTransactions.length > 0) {
        if (force) {
          // Purge inventory history as requested by force flag
          await tx.delete(inventoryTransactions).where(eq(inventoryTransactions.productId, id));
        } else {
          throw new Error("HISTORY_BLOCK");
        }
      }

      await tx.delete(products).where(eq(products.id, id));
    });
  } catch (err) {
    console.error("[deleteProduct]", { productId: id, error: String(err) });
    if (err instanceof Error) {
      if (err.message === "Product not found.") return { error: err.message };
      if (err.message === "HISTORY_BLOCK") {
        return {
          error: "Cannot delete product with existing inventory transactions. This is required for your audit trail. You can either Deactivate the product to hide it, or use 'Force Delete' to purge all history.",
          code: "HISTORY_BLOCK"
        };
      }
    }
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "23503"
    ) {
      return { error: "Cannot delete product because it is referenced in other records (e.g., invoices or channels)." };
    }
    return { error: "Failed to delete product. Please try again." };
  }

  revalidatePath("/products");
  console.log(`[deleteProduct] Product deleted successfully for id: ${id}`);
  return { success: true };
}

export async function adjustStock(_prevState: unknown, formData: FormData): Promise<{
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}> {
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
    const userId = await getAuthenticatedUserId();
    // Use a transaction to ensure stock check + update + log are atomic
    await db.transaction(async (tx) => {
      // Check product exists
      const existing = await tx
        .select({ id: products.id, quantityOnHand: products.quantityOnHand, isBundle: products.isBundle })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (existing.length === 0) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      if (existing[0].isBundle) {
        throw new Error("BUNDLE_ADJUSTMENT_NOT_ALLOWED");
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
        createdBy: userId,
      });

      // Flag all channel mappings for this product as pending_update
      await tx
        .update(channelProductMappings)
        .set({ syncStatus: "pending_update" })
        .where(eq(channelProductMappings.productId, productId));
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("PRODUCT_NOT_FOUND")) {
      return { error: "Product not found." };
    }
    if (message.includes("BUNDLE_ADJUSTMENT_NOT_ALLOWED")) {
      return { error: "Stock adjustments are not allowed for bundle products. Stock is derived from components." };
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
  console.log(`[adjustStock] Stock adjusted for product ${productId}: ${quantity > 0 ? "+" : ""}${quantity}`);
  return { success: true };
}

// ─── Channel Product Mappings ─────────────────────────────────────────────────

export async function deleteChannelMapping(_prevState: unknown, formData: FormData): Promise<{ success?: boolean; error?: string }> {
  const parsed = ChannelMappingIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid mapping ID." };

  try {
    const userId = await getAuthenticatedUserId();
    // Verify ownership via join
    const rows = await db
      .select({ productId: channelProductMappings.productId })
      .from(channelProductMappings)
      .innerJoin(channels, eq(channelProductMappings.channelId, channels.id))
      .where(
        and(
          eq(channelProductMappings.id, parsed.data.id),
          eq(channels.userId, userId),
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
export async function pushProductStockToChannels(productId: number): Promise<{ success?: boolean; error?: string } & Record<string, any>> {
  try {
    const userId = await getAuthenticatedUserId();
    const result = await pushProductStockToChannelsService(userId, productId);
    revalidatePath(`/products/${productId}`);
    revalidatePath("/inventory/sync");
    return { success: true, ...result };
  } catch (err) {
    console.error("[pushProductStockToChannels]", { productId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "") || "Failed to push stock to channels." };
  }
}

// ─── Fetch channel products with mapping state ────────────────────────────────

export async function fetchChannelProducts(
  channelId: number,
  productId: number,
  search?: string,
  page: number = 1,
  limit: number = 50,
): Promise<{ products: ChannelProductWithState[]; total: number } | { error: string }> {
  try {
    const userId = await getAuthenticatedUserId();

    const channel = await getConnectedChannel(userId, channelId);
    if (!channel) throw new Error("Channel not found.");
    if (channel.status !== "connected") throw new Error("Channel is not connected.");

    const offset = (page - 1) * limit;

    try {
      const { products: rawProducts, total } = await getExternalProducts(channelId, search, limit, offset);

      const existingMappings = await getExistingMappingsForChannel(channelId);
      const mappingByExternalId = new Map(
        existingMappings.map((m) => [m.externalProductId, { productId: m.productId, productName: m.productName }]),
      );

      const productsWithMappingState = rawProducts.map((p): ChannelProductWithState => {
        const existing = mappingByExternalId.get(p.id);
        const base = {
          ...p,
          sku: p.sku || undefined,
          stockQuantity: p.stockQuantity ?? undefined,
          type: (p.type as "simple" | "variable" | "variation") || "simple",
          parentId: p.parentId ?? undefined,
          rawPayload: p.rawPayload as Record<string, unknown>,
        };

        if (!existing) {
          return { ...base, mappingState: { kind: "unmapped" } };
        }
        if (existing.productId === productId) {
          return { ...base, mappingState: { kind: "mapped_here" } };
        }
        return { ...base, mappingState: { kind: "mapped_other", productId: existing.productId, productName: existing.productName } };
      });

      return { products: productsWithMappingState, total };
    } catch (err) {
      console.error("[fetchChannelProducts] db query error", { channelId, error: String(err) });
      return { error: "Failed to fetch products from database" };
    }
  } catch (err) {
    console.error("[fetchChannelProducts]", { channelId, error: String(err) });
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function fetchChannelVariations(
  channelId: number,
  productId: number,
  parentId: string,
  search?: string,
): Promise<ChannelProductWithState[] | { error: string }> {
  try {
    const userId = await getAuthenticatedUserId();
    const channel = await getConnectedChannel(userId, channelId);
    if (!channel || channel.status !== "connected") throw new Error("Channel not found or not connected.");

    const rawVariations = await getVariationsForParent(channelId, parentId, search);

    return rawVariations.map((v): ChannelProductWithState => ({
      ...v,
      sku: v.sku || undefined,
      stockQuantity: v.stockQuantity ?? undefined,
      type: "variation",
      parentId: v.parentId ?? undefined,
      rawPayload: v.rawPayload as Record<string, unknown>,
    }));
  } catch (err) {
    console.error("[fetchChannelVariations]", { channelId, parentId, error: String(err) });
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ─── Batch save channel mappings ──────────────────────────────────────────────

export async function saveChannelMappings(
  productId: number,
  channelId: number,
  items: { externalProductId: string; label: string }[],
): Promise<{ added: number; skipped: number } | { error: string }> {
  try {
    const userId = await getAuthenticatedUserId();

    if (items.length === 0) return { added: 0, skipped: 0 };

    const channel = await getConnectedChannel(userId, channelId);
    if (!channel) throw new Error("Channel not found.");

    let added = 0;
    let skipped = 0;

    for (const item of items) {
      try {
        const result = await insertChannelMappingQuietly(channelId, productId, item.externalProductId, item.label || null);
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

    revalidatePath(`/products/${productId}`);
    return { added, skipped };
  } catch (err) {
    console.error("[saveChannelMappings]", { channelId, productId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "") || "Failed to save mappings. Please try again." };
  }
}

export async function getAttributeKeys() {
  try {
    await getAuthenticatedUserId();
    return await getUniqueAttributeKeys();
  } catch (err) {
    console.error("[getAttributeKeys]", err);
    return [];
  }
}

export async function getAttributeValuesAction(key: string) {
  try {
    await getAuthenticatedUserId();
    return await getAttributeValues(key);
  } catch (err) {
    console.error("[getAttributeValuesAction]", err);
    return [];
  }
}

export interface SimpleProduct {
  id: number;
  name: string;
  sku: string | null;
}

export async function getSimpleProductsAction(): Promise<SimpleProduct[]> {
  try {
    await getAuthenticatedUserId();
    return await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
      })
      .from(products)
      .where(eq(products.isBundle, false))
      .orderBy(products.name);
  } catch (err) {
    console.error("[getSimpleProductsAction]", err);
    return [];
  }
}

export async function getProductWithComponentsAction(id: number): Promise<any | null> {
  try {
    await getAuthenticatedUserId();
    return await getProductById(id, db);
  } catch (err) {
    console.error("[getProductWithComponentsAction]", err);
    return null;
  }
}
