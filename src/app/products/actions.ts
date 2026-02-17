"use server";

import { db } from "@/db";
import { products, inventoryTransactions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductIdSchema,
  StockAdjustmentSchema,
} from "@/lib/validations/products";

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
      return { error: "A product with this SKU already exists." };
    }
    return { error: "Failed to create product. Please try again." };
  }

  revalidatePath("/products");
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
