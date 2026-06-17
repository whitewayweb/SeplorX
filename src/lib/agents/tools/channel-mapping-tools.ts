/**
 * Tools for the Channel Mapping Agent.
 *
 * These tools are READ-ONLY except for proposeChannelMappings which
 * writes to agent_actions (not to core tables). All actual mapping
 * writes happen via Server Actions after human approval.
 */

import { db } from "@/db";
import {
  products,
  channels,
  channelProductMappings,
  channelProducts,
  agentActions,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getPendingChannelMappings } from "@/data/agents";

// ─── Shared plan types (exported for use in approval card + action) ────────────

export type ChannelMappingProposal = {
  seplorxProductId: number;
  seplorxProductName: string;
  seplorxSku: string | null;
  externalProductId: string;
  externalProductName: string;
  externalSku: string | null;
  confidence: "high" | "medium" | "low";
  rationale: string;
};

export type ChannelMappingPlan = {
  channelId: number;
  channelName: string;
  proposals: ChannelMappingProposal[];
  reasoning: string;
};

// ─── Tool 1: Get all active SeplorX products (with attributes) ────────────────
/** @public */
export async function fetchSeplorxProducts() {
  return await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      attributes: products.attributes,
    })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(products.name);
}

// ─── Tool 2: Get unmapped channel products ────────────────────────────────────
/** @public */
export async function fetchChannelProducts(channelId: number, userId?: number) {
  const resolvedUserId = userId ?? await getAuthenticatedUserId();
  // Load channel row
  const channelRows = await db
    .select({
      id: channels.id,
      name: channels.name,
      channelType: channels.channelType,
      storeUrl: channels.storeUrl,
      credentials: channels.credentials,
      status: channels.status,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.userId, resolvedUserId)))
    .limit(1);

  if (channelRows.length === 0) {
    throw new Error(`Channel ${channelId} not found.`);
  }

  const channel = channelRows[0];
  if (channel.status !== "connected") {
    throw new Error(`Channel ${channelId} is not connected (status: ${channel.status}).`);
  }

  const channelProductsRows = await db
    .select({
      id: channelProducts.externalId,
      name: channelProducts.name,
      sku: channelProducts.sku,
      stockQuantity: channelProducts.stockQuantity,
    })
    .from(channelProducts)
    .where(eq(channelProducts.channelId, channelId));

  if (channelProductsRows.length === 0) {
    return { message: "No products found in the cache for this channel. Please sync products first." };
  }

  // Collect all already-mapped externalProductIds for this channel
  const mappedRows = await db
    .select({ externalProductId: channelProductMappings.externalProductId })
    .from(channelProductMappings)
    .where(eq(channelProductMappings.channelId, channelId));

  const mappedIds = new Set(mappedRows.map((r) => r.externalProductId));
  const alreadyMappedCount = mappedIds.size;

  // Collect already pending agent proposals so we don't map them twice
  const pendingProps = await getPendingChannelMappings();
  const pendingMapIds = new Set(
    pendingProps
      .filter((p) => p.channelId === channelId)
      .map((p) => p.externalProductId)
  );

  const unmappedProducts = channelProductsRows.filter(
    (p) => !mappedIds.has(p.id) && !pendingMapIds.has(p.id)
  );

  return {
    channelName: channel.name,
    channelType: channel.channelType,
    alreadyMappedCount,
    pendingProposedCount: pendingMapIds.size,
    unmappedCount: unmappedProducts.length,
    products: unmappedProducts.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku ?? null,
      stockQuantity: p.stockQuantity ?? null,
    })),
  };
}

// ─── Tool 3: Propose channel mappings (writes to agent_actions only) ──────────
/** @public */
export async function saveChannelMappingProposal(plan: ChannelMappingPlan) {
  const [row] = await db
    .insert(agentActions)
    .values({
      agentType: "channel_mapping",
      status: "pending_approval",
      plan: plan as unknown as Record<string, unknown>,
    })
    .returning({ id: agentActions.id });

  return { taskId: row.id };
}
