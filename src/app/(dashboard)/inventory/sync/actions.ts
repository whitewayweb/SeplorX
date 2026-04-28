"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth";
import { pushBulkProductStockToChannelsService } from "@/lib/stock/channel-sync";
import { getPendingStockSyncProductDetails } from "@/data/products";
import { getChannelById } from "@/lib/channels/registry";
import type { ChannelType } from "@/lib/channels/types";

const ProductIdsSchema = z.array(z.number().int().positive()).min(1).max(200);

export async function pushSelectedProductStock(productIds: number[]) {
  const parsed = ProductIdsSchema.safeParse(productIds);
  if (!parsed.success) return { error: "Select at least one valid product." };

  try {
    const userId = await getAuthenticatedUserId();
    const results = await pushBulkProductStockToChannelsService(userId, parsed.data);
    const flattened = results.flatMap((product) =>
      product.results.map((result) => ({
        productId: product.productId,
        quantity: product.quantity,
        ...result,
      })),
    );

    revalidatePath("/inventory");
    revalidatePath("/inventory/sync");
    revalidatePath("/");

    for (const productId of parsed.data) {
      revalidatePath(`/products/${productId}`);
    }

    return {
      success: true,
      products: results.length,
      pushed: flattened.filter((r) => r.ok).length,
      failed: flattened.filter((r) => !r.ok && !r.skipped).length,
      skipped: flattened.filter((r) => r.skipped).length,
      results: flattened,
    };
  } catch (err) {
    console.error("[pushSelectedProductStock]", { error: String(err) });
    return { error: String(err).replace(/^Error:\s*/, "") || "Failed to push stock." };
  }
}

export async function getStockSyncProductDetails(productId: number) {
  const parsed = z.number().int().positive().safeParse(productId);
  if (!parsed.success) return { error: "Invalid product ID." };

  try {
    const userId = await getAuthenticatedUserId();
    const product = await getPendingStockSyncProductDetails(userId, parsed.data);
    if (!product) return { error: "No pending stock sync details found for this product." };

    return {
      success: true,
      product: {
        ...product,
        mappings: product.mappings.map((mapping) => {
          const channelDef = getChannelById(mapping.channelType as ChannelType);
          return {
            ...mapping,
            canPushStock: !!channelDef?.capabilities?.canPushStock,
          };
        }),
      },
    };
  } catch (err) {
    console.error("[getStockSyncProductDetails]", { productId, error: String(err) });
    return { error: "Failed to load stock sync details." };
  }
}
