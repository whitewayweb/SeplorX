"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { channelProductMappings, channels } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/auth";
import { backfillSalesOrderItemsForChannelMapping } from "@/lib/orders/costs";
import { and, eq } from "drizzle-orm";

export type ResolveMissingCostMappingState =
  | { success: true; message: string }
  | { error: string }
  | null;

type ResolveMissingCostMappingResult =
  | { success: true; updatedOrderItems: number }
  | { error: string };

const CHANNEL_MAPPING_LABEL_MAX_LENGTH = 255;

function normalizeChannelMappingLabel(label: string | null): string | null {
  if (!label) return null;
  return label.slice(0, CHANNEL_MAPPING_LABEL_MAX_LENGTH);
}

export async function resolveMissingCostMapping(
  _prevState: ResolveMissingCostMappingState,
  formData: FormData,
): Promise<ResolveMissingCostMappingState> {
  const userId = await getAuthenticatedUserId();
  const channelId = Number(formData.get("channelId"));
  const productId = Number(formData.get("productId"));
  const externalProductId = String(formData.get("externalProductId") || "").trim();
  const label = String(formData.get("label") || "").trim() || null;

  if (!Number.isInteger(channelId) || channelId <= 0) {
    return { error: "Select a valid channel product row." };
  }

  if (!Number.isInteger(productId) || productId <= 0) {
    return { error: "Select a SeplorX product to map." };
  }

  if (!externalProductId) {
    return { error: "This row has no channel product identifier to map." };
  }

  try {
    const result: ResolveMissingCostMappingResult = await db.transaction(async (tx) => {
      const [channel] = await tx
        .select({ id: channels.id })
        .from(channels)
        .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
        .limit(1);

      if (!channel) {
        return { error: "Channel not found." };
      }

      await tx
        .insert(channelProductMappings)
        .values({
          channelId,
          productId,
          externalProductId,
          label: normalizeChannelMappingLabel(label),
        })
        .onConflictDoUpdate({
          target: [
            channelProductMappings.channelId,
            channelProductMappings.externalProductId,
          ],
          set: {
            productId,
            label: normalizeChannelMappingLabel(label),
            syncStatus: "pending_update",
            lastSyncError: null,
          },
        });

      const updatedOrderItems = await backfillSalesOrderItemsForChannelMapping(
        tx,
        channelId,
        externalProductId,
        productId,
      );

      return { success: true, updatedOrderItems };
    });

    if ("error" in result) return result;

    revalidatePath("/");
    revalidatePath("/audit/missing-cost");
    revalidatePath("/products");

    return {
      success: true,
      message: `Mapped product and backfilled ${result.updatedOrderItems} order item${result.updatedOrderItems === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    console.error("Failed to resolve missing-cost mapping", error);
    return { error: "Could not resolve this mapping. Please try again." };
  }
}
