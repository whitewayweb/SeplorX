"use server";

import { db } from "@/db";
import { channels } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CreateChannelSchema, ChannelIdSchema, UpdateChannelSchema } from "@/lib/validations/channels";
import { getChannelById } from "@/lib/channels/registry";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import type { ChannelType } from "@/lib/channels/types";
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
} from "@/lib/channels/services";

const CURRENT_USER_ID = 1;

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

    const channelId = await createChannelService(CURRENT_USER_ID, parsed.data, rawConfig);
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
    const rawConfig: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") rawConfig[key] = value;
    }

    await updateChannelService(CURRENT_USER_ID, parsed.data.id, parsed.data, rawConfig);
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
    const existing = await db
      .select({ channelType: channels.channelType, storeUrl: channels.storeUrl, credentials: channels.credentials })
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.userId, CURRENT_USER_ID)))
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
    const row = await resetChannelStatusService(CURRENT_USER_ID, channelId);
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
    await disconnectChannelService(CURRENT_USER_ID, parsed.data.id);
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
    await deleteChannelService(CURRENT_USER_ID, parsed.data.id);
    revalidatePath("/channels");
    return { success: true };
  } catch (err) {
    console.error("[deleteChannel]", { channelId: parsed.data.id, error: String(err) });
    return { error: "Failed to delete channel." };
  }
}

export async function registerChannelWebhooks(channelId: number) {
  try {
    await registerChannelWebhooksService(CURRENT_USER_ID, channelId);
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
    const count = await syncChannelProductsService(CURRENT_USER_ID, parsed.data.id);
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
    await clearChannelProductsService(CURRENT_USER_ID, parsed.data.id);
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
    const product = await getCatalogItemService(CURRENT_USER_ID, parsedId.data.id, parsedAsin.data);
    revalidatePath("/channels");
    return { success: true, product };
  } catch (err) {
    console.error("[getCatalogItem]", { channelId: parsedId.data.id, asin, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "").substring(0, 200) };
  }
}

export async function getChannelProduct(productId: number) {
  const parsed = z.number().int().positive().safeParse(productId);
  if (!parsed.success) return { error: "Invalid product ID." };

  try {
    const { getChannelProductById } = await import("@/lib/channels/queries");
    const product = await getChannelProductById(parsed.data);
    if (!product) return { error: "Product not found." };
    return { success: true, product };
  } catch (err) {
    console.error("[getChannelProduct]", { productId, error: String(err) });
    return { error: "Failed to load product details." };
  }
}
