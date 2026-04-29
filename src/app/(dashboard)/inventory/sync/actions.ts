"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth";
import {
  createStockPushJobService,
  processStockPushJobBatchService,
  type StockPushJobView,
} from "@/lib/stock/channel-sync";
import { getPendingStockSyncProductDetails, type PendingStockSyncProduct } from "@/data/products";
import { getChannelById } from "@/lib/channels/registry";
import type { ChannelType } from "@/lib/channels/types";

const ProductIdSchema = z.number().int().positive();
const JobIdSchema = z.number().int().positive();

type ActionError = { success?: false; error: string };
type StockSyncProductDetailResult =
  | {
      success: true;
      product: PendingStockSyncProduct & {
        mappings: Array<PendingStockSyncProduct["mappings"][number] & { canPushStock: boolean }>;
      };
    }
  | ActionError;
type StockPushJobActionResult = { success: true; job: StockPushJobView } | ActionError;

const STOCK_PUSH_START_ERROR = "Failed to start stock push.";
const STOCK_PUSH_POLL_ERROR = "Failed to check stock push progress.";

export async function getStockSyncProductDetails(productId: number): Promise<StockSyncProductDetailResult> {
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

export async function startStockPushJob(productId: number): Promise<StockPushJobActionResult> {
  const parsed = ProductIdSchema.safeParse(productId);
  if (!parsed.success) return { error: "Invalid product ID." };

  try {
    const userId = await getAuthenticatedUserId();
    const job = await createStockPushJobService(userId, parsed.data);
    return { success: true, job };
  } catch (err) {
    console.error("[startStockPushJob]", { productId, error: err });
    return { error: STOCK_PUSH_START_ERROR };
  }
}

export async function pollStockPushJob(jobId: number): Promise<StockPushJobActionResult> {
  const parsed = JobIdSchema.safeParse(jobId);
  if (!parsed.success) return { error: "Invalid job ID." };

  try {
    const userId = await getAuthenticatedUserId();
    const job = await processStockPushJobBatchService(userId, parsed.data);

    if (job.status === "done" || job.status === "failed") {
      revalidatePath("/inventory");
      revalidatePath("/inventory/sync");
      revalidatePath("/");
      revalidatePath(`/products/${job.productId}`);
    }

    return { success: true, job };
  } catch (err) {
    console.error("[pollStockPushJob]", { jobId, error: err });
    return { error: STOCK_PUSH_POLL_ERROR };
  }
}
