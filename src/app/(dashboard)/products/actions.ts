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
import {
  pushProductStockToChannelsService,
  fetchChannelProductsService,
  saveChannelMappingsService,
  type ChannelProductWithState,
} from "@/lib/products/services";
import { getAuthenticatedUserId } from "@/lib/auth";

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
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw new Error("Product not found.");
      }

      const hasTransactions = await tx
        .select({ id: inventoryTransactions.id })
        .from(inventoryTransactions)
        .where(eq(inventoryTransactions.productId, id))
        .limit(1);

      if (hasTransactions.length > 0) {
        throw new Error("Cannot delete product with existing inventory records. Deactivate instead.");
      }

      await tx.delete(products).where(eq(products.id, id));
    });
  } catch (err) {
    console.error("[deleteProduct]", { productId: id, error: String(err) });
    if (err instanceof Error) {
      if (err.message === "Product not found.") return { error: err.message };
      if (err.message === "Cannot delete product with existing inventory records. Deactivate instead.") return { error: err.message };
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
    const userId = await getAuthenticatedUserId();
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
        createdBy: userId,
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
export async function pushProductStockToChannels(productId: number) {
  try {
    const userId = await getAuthenticatedUserId();
    const result = await pushProductStockToChannelsService(userId, productId);
    return result;
  } catch (err) {
    console.error("[pushProductStockToChannels]", { productId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "") || "Failed to push stock to channels." };
  }
}

// ─── Fetch channel products with mapping state ────────────────────────────────

export { type ChannelProductWithState } from "@/lib/products/services";

export async function fetchChannelProducts(
  channelId: number,
  productId: number,
  search?: string,
): Promise<ChannelProductWithState[] | { error: string }> {
  try {
    const userId = await getAuthenticatedUserId();
    const products = await fetchChannelProductsService(userId, channelId, productId, search);
    return products;
  } catch (err) {
    console.error("[fetchChannelProducts]", { channelId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "") || "Unable to load channel products." };
  }
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
  try {
    const userId = await getAuthenticatedUserId();
    const result = await saveChannelMappingsService(userId, productId, channelId, items);
    revalidatePath(`/products/${productId}`);
    return result;
  } catch (err) {
    console.error("[saveChannelMappings]", { channelId, productId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "") || "Failed to save mappings. Please try again." };
  }
}
