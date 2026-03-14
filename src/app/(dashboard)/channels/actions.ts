"use server";

import { db } from "@/db";
import { channels } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CreateChannelSchema, ChannelIdSchema, UpdateChannelSchema, ProductDetailsTabSchema, OfferInventoryTabSchema, ChannelProductIdentifiersSchema } from "@/lib/validations/channels";
import { getChannelById } from "@/lib/channels/registry";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import type { ChannelType } from "@/lib/channels/types";
import type { ChannelProductUpdatePatch } from "@/lib/channels/services";
import { z } from "zod";
import {
  createChannelService,
  updateChannelService,
  resetChannelStatusService,
  disconnectChannelService,
  deleteChannelService,
  registerChannelWebhooksService,
  syncChannelProductsService,
  clearChannelProductsService,
  getCatalogItemService,
  updateChannelProductService,
} from "@/lib/channels/services";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function createChannel(_prevState: unknown, formData: FormData) {
  const parsed = CreateChannelSchema.safeParse({
    channelType: String(formData.get("channelType") || ""),
    name: String(formData.get("name") || ""),
    storeUrl: (formData.get("storeUrl") as string) || undefined,
    defaultPickupLocation: (formData.get("defaultPickupLocation") as string) || undefined,
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const userId = await getAuthenticatedUserId();
    const channelDef = getChannelById(parsed.data.channelType as ChannelType);
    const rawConfig: Record<string, string> = {};

    if (channelDef?.configFields) {
      for (const field of channelDef.configFields) {
        const val = formData.get(field.key);
        if (val && typeof val === "string") {
          rawConfig[field.key] = val;
        }
      }
    }

    const channelId = await createChannelService(userId, parsed.data, rawConfig);
    revalidatePath("/channels");
    return { success: true, channelId };
  } catch (err) {
    console.error("[createChannel]", { error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "") || "Failed to create channel." };
  }
}

export async function updateChannel(_prevState: unknown, formData: FormData) {
  const parsed = UpdateChannelSchema.safeParse({
    id: formData.get("id"),
    name: String(formData.get("name") || ""),
    defaultPickupLocation: (formData.get("defaultPickupLocation") as string) || undefined,
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const userId = await getAuthenticatedUserId();
    const rawConfig: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") rawConfig[key] = value;
    }

    await updateChannelService(userId, parsed.data.id, parsed.data, rawConfig);
    revalidatePath("/channels");
    return { success: true };
  } catch (err) {
    console.error("[updateChannel]", { error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "") || "Failed to update channel." };
  }
}

export async function getChannelConfig(channelId: number) {
  const parsed = z.number().int().positive().safeParse(channelId);
  if (!parsed.success) return { error: "Invalid channel ID." };

  try {
    const userId = await getAuthenticatedUserId();
    const existing = await db
      .select({ channelType: channels.channelType, storeUrl: channels.storeUrl, credentials: channels.credentials })
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
      .limit(1);

    if (existing.length === 0) return { error: "Not found" };

    const channelDef = getChannelById(existing[0].channelType as ChannelType);
    const decryptedCreds = decryptChannelCredentials(existing[0].credentials || {});

    const config: Record<string, string> = {};
    if (existing[0].storeUrl) {
      config.storeUrl = existing[0].storeUrl;
    }

    if (channelDef?.configFields) {
      for (const field of channelDef.configFields) {
        if (field.key !== "storeUrl" && decryptedCreds[field.key] && field.type !== "password") {
          config[field.key] = decryptedCreds[field.key];
        }
      }
    }
    return { success: true, config };
  } catch {
    return { error: "Failed to load config." };
  }
}

export async function resetChannelStatus(channelId: number) {
  const parsed = z.number().int().positive().safeParse(channelId);
  if (!parsed.success) return { error: "Invalid channel ID." };

  try {
    const userId = await getAuthenticatedUserId();
    const row = await resetChannelStatusService(userId, channelId);
    revalidatePath("/channels");
    return { success: true, channelId: row.id, storeUrl: row.storeUrl };
  } catch (err) {
    console.error("[resetChannelStatus]", { channelId, error: String(err) });
    return { error: "Failed to reset channel status." };
  }
}

export async function disconnectChannel(_prevState: unknown, formData: FormData) {
  const parsed = ChannelIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid channel ID." };

  try {
    const userId = await getAuthenticatedUserId();
    await disconnectChannelService(userId, parsed.data.id);
    revalidatePath("/channels");
    return { success: true };
  } catch (err) {
    console.error("[disconnectChannel]", { channelId: parsed.data.id, error: String(err) });
    return { error: "Failed to disconnect channel." };
  }
}

export async function deleteChannel(_prevState: unknown, formData: FormData) {
  const parsed = ChannelIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid channel ID." };

  try {
    const userId = await getAuthenticatedUserId();
    await deleteChannelService(userId, parsed.data.id);
    revalidatePath("/channels");
    return { success: true };
  } catch (err) {
    console.error("[deleteChannel]", { channelId: parsed.data.id, error: String(err) });
    return { error: "Failed to delete channel." };
  }
}

export async function registerChannelWebhooks(channelId: number) {
  try {
    const userId = await getAuthenticatedUserId();
    await registerChannelWebhooksService(userId, channelId);
    revalidatePath("/channels");
    return { success: true };
  } catch (err) {
    console.error("[registerChannelWebhooks]", { channelId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "").substring(0, 200) };
  }
}

export async function syncChannelProducts(channelId: number) {
  const parsed = ChannelIdSchema.safeParse({ id: channelId });
  if (!parsed.success) return { error: "Invalid channel ID." };

  try {
    const userId = await getAuthenticatedUserId();
    const count = await syncChannelProductsService(userId, parsed.data.id);
    revalidatePath("/channels");
    return { success: true, count };
  } catch (err) {
    console.error("[syncChannelProducts]", { channelId: parsed.data.id, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "").substring(0, 200) };
  }
}

export async function clearChannelProducts(channelId: number) {
  const parsed = ChannelIdSchema.safeParse({ id: channelId });
  if (!parsed.success) return { error: "Invalid channel ID." };

  try {
    const userId = await getAuthenticatedUserId();
    await clearChannelProductsService(userId, parsed.data.id);
    revalidatePath("/channels");
    revalidatePath(`/products/channels/${parsed.data.id}`);
    return { success: true };
  } catch (err) {
    console.error("[clearChannelProducts]", { channelId: parsed.data.id, error: String(err) });
    return { error: "Failed to clear products. Please try again." };
  }
}

export async function getCatalogItem(channelId: number, asin: string) {
  const parsedId = ChannelIdSchema.safeParse({ id: channelId });
  if (!parsedId.success) return { error: "Invalid channel ID." };

  const parsedAsin = z.string().min(1).safeParse(asin);
  if (!parsedAsin.success) return { error: "A valid ASIN is required." };

  try {
    const userId = await getAuthenticatedUserId();
    const product = await getCatalogItemService(userId, parsedId.data.id, parsedAsin.data);
    revalidatePath("/channels");
    revalidatePath(`/products/channels/${parsedId.data.id}`);
    return { success: true, product };
  } catch (err) {
    console.error("[getCatalogItem]", { contextId: String(parsedId.data.id), channelId: parsedId.data.id, asin, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "").substring(0, 200) };
  }
}

export async function getChannelProduct(productId: number) {
  const parsed = z.number().int().positive().safeParse(productId);
  if (!parsed.success) return { error: "Invalid product ID." };

  try {
    const userId = await getAuthenticatedUserId();
    const { getChannelProductByIdForUser } = await import("@/lib/channels/queries");
    const product = await getChannelProductByIdForUser(userId, parsed.data);
    if (!product) return { error: "Product not found." };
    return { success: true, product };
  } catch (err) {
    console.error("[getChannelProduct]", { productId, error: String(err) });
    return { error: "Failed to load product details." };
  }
}

export async function updateChannelProductDetails(_prevState: unknown, formData: FormData) {
  // Validate untrusted identifiers that control which DB rows are mutated
  const identifiersParsed = ChannelProductIdentifiersSchema.safeParse({
    id:         formData.get("id"),
    channelId:  formData.get("channelId"),
    externalId: formData.get("externalId"),
  });

  if (!identifiersParsed.success) {
    return { error: "Missing or invalid product identifiers.", fieldErrors: identifiersParsed.error.flatten().fieldErrors };
  }

  const { id, channelId, externalId } = identifiersParsed.data;
  // Detect active tab — formData.has() is false for inputs not in the DOM.
  const isDetailsTab = formData.has("name");
  const isOfferTab   = formData.has("stockQuantity") || formData.has("price") || formData.has("sku") || formData.has("itemCondition");

  const patch: ChannelProductUpdatePatch = {};

  // Validate + extract "Product Details" tab fields
  if (isDetailsTab) {
    const parsed = ProductDetailsTabSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) {
      return { error: "Validation failed.", fieldErrors: parsed.error.flatten().fieldErrors };
    }
    patch.name = parsed.data.name;
  }

  // Validate + extract "Offer & Inventory" tab fields
  if (isOfferTab) {
    const raw = {
      sku:           formData.get("sku")           ?? undefined,
      price:         formData.get("price")         ?? undefined,
      stockQuantity: formData.get("stockQuantity") ?? undefined,
      itemCondition: formData.get("itemCondition") ?? undefined,
    };
    const parsed = OfferInventoryTabSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: "Validation failed.", fieldErrors: parsed.error.flatten().fieldErrors };
    }
    if (parsed.data.sku !== undefined)           patch.sku           = parsed.data.sku;
    if (parsed.data.stockQuantity !== undefined) patch.stockQuantity = parsed.data.stockQuantity;
    if (parsed.data.price !== undefined)         patch.price         = parsed.data.price;
    if (parsed.data.itemCondition !== undefined) patch.itemCondition = parsed.data.itemCondition;
  }

  try {
    const userId = await getAuthenticatedUserId();
    await updateChannelProductService(userId, channelId, id, externalId, patch);
    revalidatePath(`/products/channels/${channelId}`);
    return { success: true, productId: id };
  } catch (err) {
    console.error("[updateChannelProductDetails]", { id, error: String(err) });
    const errorMessage = err instanceof Error ? err.message : "Failed to update channel product details.";
    return { error: errorMessage };
  }
}
