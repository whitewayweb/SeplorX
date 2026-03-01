"use server";

import { db } from "@/db";
import { channels } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CreateChannelSchema, ChannelIdSchema } from "@/lib/validations/channels";
import { getChannelHandler, getChannelById } from "@/lib/channels/registry";
import type { ChannelType } from "@/lib/channels/types";
import { decrypt, encrypt } from "@/lib/crypto";
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
    const handler = getChannelHandler(parsed.data.channelType);
    
    const credentials: Record<string, string> = {};
    let status: "pending" | "connected" | "disconnected" = "pending";

    if (channelDef?.authType === "apikey" && handler) {
      status = "connected";
      for (const field of handler.configFields) {
        if (field.key !== "storeUrl") {
          const val = formData.get(field.key);
          if (val && typeof val === "string") {
            credentials[field.key] = encrypt(val);
          }
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

    const creds = channel.credentials ?? {};
    const consumerKey = creds.consumerKey ? decrypt(creds.consumerKey) : "";
    const consumerSecret = creds.consumerSecret ? decrypt(creds.consumerSecret) : "";
    if (!consumerKey || !consumerSecret) return { error: "Channel credentials are missing." };

    const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const webhookBaseUrl = `${appUrl}/api/channels/${channel.channelType}/webhook/${channelId}`;

    const { secret } = await handler.registerWebhooks(
      channel.storeUrl,
      { consumerKey, consumerSecret },
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
