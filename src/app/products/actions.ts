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
import { ChannelMappingSchema, ChannelMappingIdSchema } from "@/lib/validations/channels";
import { getChannelHandler } from "@/lib/channels/registry";
import { decrypt } from "@/lib/crypto";

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

export async function saveChannelMapping(_prevState: unknown, formData: FormData) {
  const parsed = ChannelMappingSchema.safeParse({
    channelId: formData.get("channelId"),
    productId: formData.get("productId"),
    externalProductId: formData.get("externalProductId"),
    label: formData.get("label"),
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { channelId, productId, externalProductId, label } = parsed.data;

  try {
    // Verify channel belongs to current user
    const channelRow = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.userId, CURRENT_USER_ID)))
      .limit(1);

    if (channelRow.length === 0) return { error: "Channel not found." };

    // Upsert — update label if mapping already exists, otherwise insert
    const existing = await db
      .select({ id: channelProductMappings.id })
      .from(channelProductMappings)
      .where(
        and(
          eq(channelProductMappings.channelId, channelId),
          eq(channelProductMappings.externalProductId, externalProductId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(channelProductMappings)
        .set({ productId, label: label || null })
        .where(eq(channelProductMappings.id, existing[0].id));
    } else {
      await db.insert(channelProductMappings).values({
        channelId,
        productId,
        externalProductId,
        label: label || null,
      });
    }
  } catch (err) {
    const msg = String(err);
    // 23505 = unique_violation (another SeplorX product already maps this WC ID on this channel)
    if (msg.includes("23505") || msg.includes("channel_product_mappings_ext_unique")) {
      return { error: "This WooCommerce product ID is already mapped to another SeplorX product on this channel." };
    }
    console.error("[saveChannelMapping]", { channelId, productId, error: msg });
    return { error: "Failed to save mapping. Please try again." };
  }

  revalidatePath(`/products/${productId}`);
  return { success: true };
}

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
