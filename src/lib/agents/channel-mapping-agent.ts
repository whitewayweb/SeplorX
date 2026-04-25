/**
 * Channel Mapping Agent — matches SeplorX products to channel products.
 *
 * ONE-TO-ONE ARCHITECTURE (Free Tier Optimized):
 * 1. Fetches all required data locally in TypeScript.
 * 2. For each unmapped channel product, uses a tiny LLM call to extract
 *    {make, model, position, color} from the product title (~150 tokens).
 * 3. Looks up FITMENT_CHART locally to determine the series (A–E).
 * 4. Matches series + color to a SeplorX product via attributes/name.
 * 5. Collects all results and saves as a single proposal batch.
 *
 * PROVIDER CASCADE (3-tier, all free):
 *   Tier 1: OpenRouter — google/gemini-2.0-flash-001 (paid model, free quota)
 *   Tier 2: OpenRouter — google/gemini-2.0-flash-exp:free (explicitly free)
 *   Tier 3: Gemini Direct — gemini-2.0-flash via GOOGLE_GENERATIVE_AI_API_KEY
 *
 * On 429/rate-limit errors, the current tier is marked exhausted and all
 * subsequent products use the next tier. This is "sticky" per run.
 */

import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import {
  saveChannelMappingProposal,
  fetchSeplorxProducts,
  fetchChannelProducts,
  lookupFitmentSeries,
  findSeplorxProduct,
} from "./tools/channel-mapping-tools";
import { logger } from "@/lib/logger";

// ─── Provider Cascade ─────────────────────────────────────────────────────────

type TierLevel = 1 | 2 | 3;

/** Sticky tier state — once a tier 429s, we never go back. */
let currentTier: TierLevel = 1;

function getModel() {
  if (currentTier === 1 && process.env.OPENROUTER_KEY) {
    const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_KEY });
    return openrouter.chat("google/gemini-2.0-flash-001");
  }
  if (currentTier <= 2 && process.env.OPENROUTER_KEY) {
    const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_KEY });
    return openrouter.chat("google/gemini-2.0-flash-exp:free");
  }
  // Tier 3: Gemini direct
  return google("gemini-2.0-flash");
}

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("too many requests")
  );
}

function downgrade(): boolean {
  if (currentTier < 3) {
    currentTier = (currentTier + 1) as TierLevel;
    logger.info(`[channel-mapping] Downgraded to tier ${currentTier}`);
    return true; // retryable
  }
  return false; // all tiers exhausted
}

// ─── Extraction Schema ────────────────────────────────────────────────────────

const ExtractionSchema = z.object({
  make: z.string().describe("Car manufacturer (e.g., 'Mercedes', 'Maruti Suzuki', 'BMW', 'KIA')"),
  model: z.string().describe("Car model (e.g., 'C 220', 'Swift', 'X-1', 'Sonet')"),
  position: z
    .enum(["front", "rear", "both"])
    .describe("Buffer pad position: front, rear, or both (for 4pc sets)"),
  color: z
    .string()
    .nullable()
    .describe("Product color if mentioned (e.g., 'Yellow', 'Transparent', 'Black'). null if not mentioned."),
});

// ─── Main Agent ───────────────────────────────────────────────────────────────

/**
 * Extracts automotive fitment from each product title one-by-one, looks up
 * the series from the fitment chart, and maps to a SeplorX product.
 */
export async function runChannelMappingAgent(
  channelId: number,
  userId: number,
): Promise<{ taskId: number } | { message: string } | { error: string }> {
  // Reset tier for each run
  currentTier = 1;

  try {
    // 1. Fetch Local Context
    const [seplorxProducts, channelResponse] = await Promise.all([
      fetchSeplorxProducts(),
      fetchChannelProducts(channelId, userId),
    ]);

    if ("message" in channelResponse) {
      return { message: channelResponse.message as string };
    }

    const unmapped = channelResponse.products;
    if (unmapped.length === 0) {
      return { message: "All products are already mapped." };
    }

    // Protect against massive catalogs: only process 50 unmapped products max per run.
    // This ensures the background job finishes in ~45 seconds and safely saves a batch
    // proposal to the database, preventing data loss if the server crashes.
    const unmappedBatch = unmapped.slice(0, 50);

    logger.info(`[agent/channel-mapping] Found ${unmapped.length} unmapped products. Processing a batch of ${unmappedBatch.length}.`);

    // 2. Process each product one-by-one (sequential for rate-limit safety)
    const proposals: Array<{
      seplorxProductId: number;
      seplorxProductName: string;
      seplorxSku: string | null;
      externalProductId: string;
      externalProductName: string;
      externalSku: string | null;
      confidence: "high" | "medium" | "low";
      rationale: string;
    }> = [];
    const errors: string[] = [];

    // Counters for final logging
    let unmatchCount = 0;
    let skippedNonAuto = 0;

    for (const product of unmappedBatch) {
      try {
        // Step A: LLM extracts {make, model, position, color} from title
        const extraction = await extractFitmentFromTitle(product.name);

        if (!extraction) {
          // Non-automotive product — fallback to direct LLM matching against SeplorX catalog
          logger.info(`[agent/channel-mapping] 🏷️ Non-automotive fallback for: "${product.name}"`);
          
          const seplorxId = await findNonAutomotiveMatch(product.name, seplorxProducts);
          if (seplorxId) {
            const seplorx = seplorxProducts.find(p => p.id === seplorxId);
            if (seplorx) {
              logger.info(`[agent/channel-mapping] ✅ Mapped (Direct LLM): "${product.name}" -> "${seplorx.name}"`);
              proposals.push({
                seplorxProductId: seplorx.id,
                seplorxProductName: seplorx.name,
                seplorxSku: seplorx.sku,
                externalProductId: product.id,
                externalProductName: product.name,
                externalSku: product.sku,
                confidence: "medium",
                rationale: `Direct LLM semantic match (Non-Automotive): Title suggests compatibility.`,
              });
              continue;
            }
          }
          
          logger.info(`[agent/channel-mapping] ⏭️ Skipped (No Direct Match): "${product.name}"`);
          skippedNonAuto++;
          continue;
        }

        // Step B: Local fitment chart lookup → series
        const fitment = await lookupFitmentSeries(
          extraction.make,
          extraction.model,
          extraction.position,
        );

        if (!fitment) {
          logger.info(`[agent/channel-mapping] ⏭️ Skipped (Local Registry Miss): "${product.name}" → Extracted: ${extraction.make} ${extraction.model}`);
          unmatchCount++;
          continue;
        }

        // Step C: Match series + color → SeplorX product
        const seplorx = findSeplorxProduct(fitment.series, extraction.color, seplorxProducts);

        if (!seplorx) {
          logger.info(`[agent/channel-mapping] ⚠️ No SeplorX match found for "${product.name}" (Series ${fitment.series}, Color: ${extraction.color || 'none'})`);
          unmatchCount++;
          continue;
        }

        logger.info(`[agent/channel-mapping] ✅ Mapped: "${product.name}" -> "${seplorx.name}" (Series ${fitment.series})`);
        
        proposals.push({
          seplorxProductId: seplorx.id,
          seplorxProductName: seplorx.name,
          seplorxSku: seplorx.sku,
          externalProductId: product.id,
          externalProductName: product.name,
          externalSku: product.sku,
          confidence: "high",
          rationale: `${fitment.matchedMake} ${fitment.matchedModel} ${extraction.position} → Series ${fitment.series}${extraction.color ? ` (${extraction.color})` : ""}`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[agent/channel-mapping] ❌ Error processing "${product.name}": ${msg}`);
        errors.push(`${product.name}: ${msg}`);
        // Continue processing remaining products — don't abort the run
      }
    }

    if (proposals.length === 0) {
      return { message: `AI processed a batch of ${unmappedBatch.length} products but found no reliable matches.` };
    }

    // 3. Save all proposals as a single batch
    const reasoning = [
      `Processed a batch of ${unmappedBatch.length} products (out of ${unmapped.length} unmapped).`,
      `Matched ${proposals.length}, unmatched ${unmatchCount}, non-automotive skipped ${skippedNonAuto}, errors ${errors.length}.`,
      `Provider cascade used up to tier ${currentTier}.`,
    ].join(" ");

    logger.info(`[agent/channel-mapping] Run complete! Created ${proposals.length} proposals. Saving to agent_actions...`);

    const result = await saveChannelMappingProposal({
      channelId,
      channelName: channelResponse.channelName,
      proposals,
      reasoning,
    });

    return result;
  } catch (error) {
    logger.error("[runChannelMappingAgent]", error);
    return { error: error instanceof Error ? error.message : "Internal Agent Error" };
  }
}

// ─── Per-Product LLM Extraction ───────────────────────────────────────────────

/**
 * Extracts {make, model, position, color} from a single product title.
 * Uses the current provider tier. On 429, downgrades and retries once.
 */
async function extractFitmentFromTitle(
  title: string,
): Promise<{ make: string; model: string; position: "front" | "rear" | "both"; color: string | null; } | null> {
  const maxAttempts = 3; // at most 3 tiers

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { object } = await generateObject({
        model: getModel(),
        schema: ExtractionSchema,
        prompt: `Extract the car make, model, buffer pad position, and product color from this product title. If position is not clear or it says "4 PCs" or "4pc set", use "both". If color is not mentioned, return null for color.\n\nTitle: "${title}"`,
        maxRetries: 1,
      });

      return object;
    } catch (err) {
      if (isRateLimitError(err)) {
        const canRetry = downgrade();
        if (canRetry) continue; // retry with next tier
      }
      // Non-rate-limit error or all tiers exhausted
      logger.warn(`[channel-mapping] Extraction failed for "${title}":`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  return null;
}

// ─── Non-Automotive Direct Match ──────────────────────────────────────────────

/**
 * When extraction fails (e.g. "Silicone Spray"), this uses the LLM to directly 
 * match the channel product title against the SeplorX catalog names.
 */
async function findNonAutomotiveMatch(
  channelTitle: string,
  seplorxProducts: Array<{ id: number; name: string }>,
): Promise<number | null> {
  const maxAttempts = 2;
  const catalogList = seplorxProducts.map(p => `ID: ${p.id} | NAME: ${p.name}`).join("\n");
  
  const DirectMatchSchema = z.object({
    matchedSeplorxId: z.number().nullable().describe("The ID of the best matching product, or null if no reasonable match exists"),
  });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { object } = await generateObject({
        model: getModel(),
        schema: DirectMatchSchema,
        prompt: `You are mapping an external e-commerce product title to a local catalog. The external product is NOT a car-specific part, so it does not have a make/model.\n\nExternal Title: "${channelTitle}"\n\nLocal Catalog:\n${catalogList}\n\nFind the best matching local product ID. If none are a clear match, return null.`,
        maxRetries: 1,
      });

      return object.matchedSeplorxId;
    } catch (err) {
      if (isRateLimitError(err)) {
        const canRetry = downgrade();
        if (canRetry) continue;
      }
      return null;
    }
  }

  return null;
}
