"use server";

import { db } from "@/db";
import { channels } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CreateChannelSchema, ChannelIdSchema } from "@/lib/validations/channels";
import { getChannelById } from "@/lib/channels/registry";
import { getChannelHandler } from "@/lib/channels/handlers";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import { upsertChannelProducts } from "@/lib/channels/queries";
import type { ChannelType } from "@/lib/channels/types";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";

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

    // Guard: block unavailable or unknown channel types from being created,
    // even if the UI hides them — crafted POST requests could bypass it.
    if (!channelDef || !channelDef.available) {
      return { error: "This channel type is not available." };
    }

    const credentials: Record<string, string> = {};
    let status: "pending" | "connected" | "disconnected" = "pending";

    if (channelDef.authType === "apikey" && channelDef.configFields) {
      // Collect all config values first so validateConfig can inspect them.
      const rawConfig: Record<string, string> = {};
      for (const field of channelDef.configFields) {
        const val = formData.get(field.key);
        if (val && typeof val === "string") {
          rawConfig[field.key] = val;
        }
      }

      // Run channel-specific validation before touching the DB.
      if (channelDef.validateConfig) {
        const configError = channelDef.validateConfig(rawConfig);
        if (configError) return { error: configError };
      }

      // Encrypt and store credentials (exclude storeUrl — stored in its own column).
      status = "connected";
      for (const [key, val] of Object.entries(rawConfig)) {
        if (key !== "storeUrl") {
          credentials[key] = encrypt(val);
        }
      }
    }

    const [row] = await db
      .insert(channels)
      .values({
        userId: CURRENT_USER_ID,
        channelType: parsed.data.channelType,
        name: parsed.data.name,
        status,
        storeUrl: parsed.data.storeUrl || null,
        defaultPickupLocation: parsed.data.defaultPickupLocation || null,
        credentials,
      })
      .returning({ id: channels.id });

    revalidatePath("/channels");
    return { success: true, channelId: row.id };
  } catch (err) {
    console.error("[createChannel]", { error: String(err) });
    return { error: "Failed to create channel. Please try again." };
  }
}

// Called directly (not via useActionState) — resets a channel to pending so the
// OAuth flow can be re-initiated from the channel list for pending/disconnected channels.
export async function resetChannelStatus(channelId: number) {
  try {
    const [row] = await db
      .select({ id: channels.id, storeUrl: channels.storeUrl })
      .from(channels)
      .where(
        and(eq(channels.id, channelId), eq(channels.userId, CURRENT_USER_ID)),
      )
      .limit(1);

    if (!row) return { error: "Channel not found." };

    await db
      .update(channels)
      .set({ status: "pending", credentials: {}, updatedAt: new Date() })
      .where(eq(channels.id, channelId));

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
    const existing = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.id, parsed.data.id),
          eq(channels.userId, CURRENT_USER_ID),
        ),
      )
      .limit(1);

    if (existing.length === 0) return { error: "Channel not found." };

    await db
      .update(channels)
      .set({ status: "disconnected", credentials: {}, updatedAt: new Date() })
      .where(eq(channels.id, parsed.data.id));
  } catch (err) {
    console.error("[disconnectChannel]", {
      channelId: parsed.data.id,
      error: String(err),
    });
    return { error: "Failed to disconnect channel." };
  }

  revalidatePath("/channels");
  return { success: true };
}

// Called directly from channel list "Register Webhooks" button.
// Registers order webhooks on the remote store and stores the secret.
export async function registerChannelWebhooks(channelId: number) {
  try {
    const rows = await db
      .select({
        id: channels.id,
        channelType: channels.channelType,
        storeUrl: channels.storeUrl,
        status: channels.status,
        credentials: channels.credentials,
      })
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.userId, CURRENT_USER_ID)))
      .limit(1);

    if (rows.length === 0) return { error: "Channel not found." };

    const channel = rows[0];
    if (channel.status !== "connected") return { error: "Channel is not connected." };
    if (!channel.storeUrl) return { error: "Channel has no store URL." };

    const handler = getChannelHandler(channel.channelType);
    if (!handler) return { error: "This channel type does not support webhooks." };
    if (!handler.capabilities.usesWebhooks || !handler.registerWebhooks) {
      return { error: "This channel type does not use webhooks." };
    }

    const creds = channel.credentials ?? {};
    const decryptedCreds = decryptChannelCredentials(creds);
    if (Object.keys(decryptedCreds).length === 0) return { error: "Channel credentials are missing." };

    const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const webhookBaseUrl = `${appUrl}/api/channels/${channel.channelType}/webhook/${channelId}`;

    const { secret } = await handler.registerWebhooks(
      channel.storeUrl,
      decryptedCreds,
      webhookBaseUrl,
    );

    await db
      .update(channels)
      .set({
        credentials: { ...creds, webhookSecret: encrypt(secret) },
        updatedAt: new Date(),
      })
      .where(eq(channels.id, channelId));

    revalidatePath("/channels");
    return { success: true };
  } catch (err) {
    console.error("[registerChannelWebhooks]", { channelId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "").substring(0, 200) };
  }
}

export async function deleteChannel(_prevState: unknown, formData: FormData) {
  const parsed = ChannelIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid channel ID." };

  try {
    const existing = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.id, parsed.data.id),
          eq(channels.userId, CURRENT_USER_ID),
        ),
      )
      .limit(1);

    if (existing.length === 0) return { error: "Channel not found." };

    await db.delete(channels).where(eq(channels.id, parsed.data.id));
  } catch (err) {
    console.error("[deleteChannel]", {
      channelId: parsed.data.id,
      error: String(err),
    });
    return { error: "Failed to delete channel." };
  }

  revalidatePath("/channels");
  return { success: true };
}

// ─── Sync Products ─────────────────────────────────────────────────────────────

export async function syncChannelProducts(channelId: number) {
  const parsed = ChannelIdSchema.safeParse({ id: channelId });
  if (!parsed.success) return { error: "Invalid channel ID." };
  const validatedChannelId = parsed.data.id;

  try {
    const rows = await db
      .select({
        id: channels.id,
        channelType: channels.channelType,
        storeUrl: channels.storeUrl,
        credentials: channels.credentials,
        status: channels.status,
      })
      .from(channels)
      .where(and(eq(channels.id, validatedChannelId), eq(channels.userId, CURRENT_USER_ID)))
      .limit(1);

    if (rows.length === 0) return { error: "Channel not found." };

    const channel = rows[0];
    if (channel.status !== "connected") return { error: "Channel is not connected." };
    if (!channel.storeUrl) return { error: "Channel has no store URL." };

    const handler = getChannelHandler(channel.channelType);
    if (!handler || !handler.capabilities.canFetchProducts || !handler.fetchProducts) {
      return { error: "This channel type does not support fetching products." };
    }

    const decryptedCreds = decryptChannelCredentials(channel.credentials);
    if (Object.keys(decryptedCreds).length === 0) return { error: "Channel credentials missing." };

    // NOTE: `fetchProducts` may be long-running for some channel types (e.g. Amazon SP-API
    // creates a report and polls for up to ~55 s). Ensure the hosting environment (Vercel
    // function duration, etc.) is configured to allow sufficient time for this channel type.
    const externalProducts = await handler.fetchProducts(channel.storeUrl, decryptedCreds);



    if (externalProducts.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < externalProducts.length; i += BATCH_SIZE) {
        const batch = externalProducts.slice(i, i + BATCH_SIZE).map((p) => ({
          channelId: validatedChannelId,
          externalId: p.id,
          name: p.name,
          sku: p.sku || null,
          stockQuantity: p.stockQuantity ?? null,
          type: p.type || null,
          rawData: { ...p.rawPayload, parentId: p.parentId },
        }));

        await upsertChannelProducts(batch);
      }
    }


    revalidatePath("/channels");
    return { success: true, count: externalProducts.length };
  } catch (err) {
    console.error("[syncChannelProducts]", { channelId: validatedChannelId, error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "").substring(0, 200) };
  }
}
