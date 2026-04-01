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
import { getFitmentRegistry } from "@/data/fitment";

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

// ─── Tool 4: Local fitment lookup (no LLM, no DB) ────────────────────────────

/**
 * Fuzzy-match a make/model/position against the database Fitment Registry.
 * Returns the resolved series for the given position.
 * Returns null if no match found.
 *
 * Uses case-insensitive substring matching to handle LLM extraction variance.
 */
export async function lookupFitmentSeries(
  make: string,
  model: string,
  position: "front" | "rear" | "both",
): Promise<{ series: string; matchedMake: string; matchedModel: string } | null> {
  const makeNorm = make.trim().toLowerCase().replace(/[-_\s]/g, "");
  const modelNorm = model.trim().toLowerCase().replace(/[-_\s]/g, "");

  // 1. Fetch Dynamic Registry from Database
  const dbRules = await getFitmentRegistry();

  if (dbRules.length > 0) {
    // A. Find best match for Make (case insensitive, space/dash agnostic)
    const matchingMakeRules = dbRules.filter((r) => {
      const dbMakeNorm = r.make.toLowerCase().replace(/[-_\s]/g, "");
      return dbMakeNorm === makeNorm || dbMakeNorm.includes(makeNorm) || makeNorm.includes(dbMakeNorm);
    });

    if (matchingMakeRules.length > 0) {
      const matchedMake = matchingMakeRules[0].make;

      // B. Find best match for Model
      const matchingModelRules = matchingMakeRules.filter((r) => {
        const dbModelNorm = r.model.toLowerCase().replace(/[-_\s]/g, "");
        return dbModelNorm === modelNorm || dbModelNorm.includes(modelNorm) || modelNorm.includes(dbModelNorm);
      });

      if (matchingModelRules.length > 0) {
        const matchedModel = matchingModelRules[0].model;

        // C. Resolve position ("front" | "rear" | "both")
        const targetPositions = position === "both" ? ["Front", "Rear", "Both4Pc"] : [position.charAt(0).toUpperCase() + position.slice(1)];
        
        let match = matchingModelRules.find(r => targetPositions.includes(r.position));
        
        // If searching for "both" and no 4pc/Both rule found, pick whatever first matching position is available
        if (!match && position === "both") {
           match = matchingModelRules[0];
        }

        if (match) {
          return { series: match.series, matchedMake, matchedModel };
        }
      }
    }
  }

  // Fallback removed — Agent now strictly follows the DB registry.
  return null;
}

// ─── Tool 5: Match SeplorX product by series + color ──────────────────────────

type SeplorxProduct = {
  id: number;
  name: string;
  sku: string | null;
  attributes: Record<string, string>;
};

/**
 * Find a SeplorX product by its series letter (A–E) and optionally color.
 * Checks product attributes first (Series, Color), then falls back to name pattern.
 */
export function findSeplorxProduct(
  series: string,
  color: string | null,
  seplorxProducts: SeplorxProduct[],
): SeplorxProduct | null {
  const seriesUpper = series.toUpperCase();
  const colorLower = color?.trim().toLowerCase() ?? null;

  // Try matching by attributes (most reliable)
  const byAttributes = seplorxProducts.filter((p) => {
    const pSeries = (p.attributes?.Series ?? p.attributes?.series ?? "").toString();
    // Match "Series C" or just "C"
    const seriesMatch =
      pSeries.toUpperCase() === `SERIES ${seriesUpper}` ||
      pSeries.toUpperCase() === seriesUpper;
    if (!seriesMatch) return false;

    // If color was extracted, also match color
    if (colorLower) {
      const pColor = (p.attributes?.Color ?? p.attributes?.color ?? "").toString().toLowerCase();
      return pColor === colorLower;
    }
    return true;
  });

  if (byAttributes.length > 0) return byAttributes[0];

  // Fallback: match by name patterns like `CAR COIL SPRING BUFFER - "C" - YELLOW`
  const byName = seplorxProducts.filter((p) => {
    const nameUpper = p.name.toUpperCase();
    const hasSeriesInName =
      nameUpper.includes(`"${seriesUpper}"`) ||
      nameUpper.includes(`SERIES ${seriesUpper}`) ||
      nameUpper.match(new RegExp(`\\bSERIES\\s*[-]?\\s*${seriesUpper}\\b`));
    if (!hasSeriesInName) return false;

    if (colorLower) {
      return nameUpper.toLowerCase().includes(colorLower);
    }
    return true;
  });

  return byName.length > 0 ? byName[0] : null;
}
