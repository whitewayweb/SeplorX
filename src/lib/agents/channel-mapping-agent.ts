/**
 * Channel Mapping Agent — matches SeplorX products to channel (WooCommerce) products.
 *
 * Flow:
 * 1. Calls getSeplorxProducts → gets all active SeplorX products
 * 2. Calls getChannelProducts({ channelId }) → gets unmapped WC products only
 * 3. If 0 unmapped products → returns { message: "All products are already mapped." }
 * 4. Matches by name/SKU similarity → assigns confidence (high/medium/low)
 * 5. Calls proposeChannelMappings → saves to agent_actions for human approval
 */

import { generateText, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import {
  getSeplorxProducts,
  getChannelProducts,
  proposeChannelMappings,
} from "./tools/channel-mapping-tools";

const SYSTEM_PROMPT = `You are a product catalog matching assistant for a shipping management company.
Your job is to match SeplorX inventory products to products listed on a WooCommerce store, so that when an order is placed on WooCommerce, stock automatically decrements in SeplorX.

Follow this exact process:
1. Call getSeplorxProducts to get all active SeplorX products (with id, name, sku).
2. Call getChannelProducts with the provided channelId to get unmapped WooCommerce products.
3. If getChannelProducts returns 0 products (all already mapped), stop and say "All products are already mapped for this channel." — do NOT call proposeChannelMappings.
4. For each unmapped WC product, find the best matching SeplorX product using name and SKU:
   - confidence "high": exact SKU match, or WC product name is identical (case-insensitive) to SeplorX name
   - confidence "medium": WC product name contains or starts with the SeplorX product name (or vice versa), or strong partial SKU overlap
   - confidence "low": fuzzy name similarity (e.g. abbreviations, different word order but clearly same product)
   - No match: add the WC product name to the "unmatched" array
5. One SeplorX product CAN map to multiple WC products (e.g. same product sold in different pack sizes on WooCommerce). This is intentional.
6. Build a rationale string for each proposal (one sentence explaining the match reasoning).
7. Call proposeChannelMappings exactly once with all proposals, the unmatched list, and a brief reasoning summary.

Rules:
- Only propose matches you are reasonably confident about. When in doubt, assign "low" confidence rather than inventing a match.
- If no matches are found at all, do NOT call proposeChannelMappings. Instead explain why in your response.
- Keep rationale fields concise — one sentence is enough.`;

export async function runChannelMappingAgent(
  channelId: number,
): Promise<{ taskId: number } | { message: string } | { error: string }> {
  const result = await generateText({
    model: google("gemini-2.0-flash"),
    system: SYSTEM_PROMPT,
    prompt: `Match SeplorX products to channel products for channelId: ${channelId}`,
    tools: {
      getSeplorxProducts,
      getChannelProducts,
      proposeChannelMappings,
    },
    stopWhen: stepCountIs(10),
  });

  // Check if the agent produced a proposal
  for (const toolResult of result.toolResults) {
    if (
      toolResult.toolName === "proposeChannelMappings" &&
      "output" in toolResult &&
      toolResult.output &&
      typeof toolResult.output === "object" &&
      "taskId" in toolResult.output
    ) {
      return { taskId: (toolResult.output as { taskId: number }).taskId };
    }
  }

  // Agent finished without a proposal (all mapped, no matches found, etc.)
  return {
    message: result.text || "Channel mapping complete. No new proposals at this time.",
  };
}
