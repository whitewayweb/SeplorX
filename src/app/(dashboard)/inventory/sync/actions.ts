"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth";
import { pushBulkProductStockToChannelsService } from "@/lib/stock/channel-sync";

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
