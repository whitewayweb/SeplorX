"use server";

import { db } from "@/db";
import { channels } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CreateChannelSchema, ChannelIdSchema } from "@/lib/validations/channels";

const CURRENT_USER_ID = 1;

export async function createChannel(_prevState: unknown, formData: FormData) {
  const parsed = CreateChannelSchema.safeParse({
    channelType: formData.get("channelType"),
    name: formData.get("name"),
    storeUrl: formData.get("storeUrl"),
    defaultPickupLocation: formData.get("defaultPickupLocation"),
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const [row] = await db
      .insert(channels)
      .values({
        userId: CURRENT_USER_ID,
        channelType: parsed.data.channelType,
        name: parsed.data.name,
        status: "pending",
        storeUrl: parsed.data.storeUrl || null,
        defaultPickupLocation: parsed.data.defaultPickupLocation || null,
        credentials: {},
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
