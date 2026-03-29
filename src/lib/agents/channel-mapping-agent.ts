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
  getFitmentRegistryTool,
} from "./tools/channel-mapping-tools";

const SYSTEM_PROMPT = `You are a product catalog matching assistant for a shipping management company.
Your job is to match SeplorX inventory products to products listed on a WooCommerce or Amazon store.

Follow this exact process:
1. Call getSeplorxProducts to understand your SeplorX catalog.
2. Call getChannelProducts with the provided channelId to get unmapped channel products.
3. If 0 products are unmapped, stop and say "All products are already mapped."
4. CALL getFitmentRegistryTool to load the 'Car Fitment Registry' (Automotive Charts).

Matching Strategy:
- Priority 1: Exact SKU or Name match (confidence "high").
- Priority 2 (Automotive): If no SKU match, check if the channel product title mentions a car Make and Model (e.g., "VW Ameo").
   - Extract Make, Model, and Position (Front, Rear, or Both/4pc).
   - Use the Fitment Registry to find the corresponding SeplorX Product ID.
   - If a match is found in the registry, assign confidence "high" or "medium" based on title clarity.
   - Note: "Both4Pc" in the registry matches titles like "Set of 4", "Front and Rear", or "4pc".
- Priority 3: Fuzzy name similarity (confidence "low").

Rules:
- One SeplorX product (like "Series C") CAN map to many car-specific channel listings.
- Build a clear rationale for each proposal (e.g., "Matched via Fitment Registry: VW Ameo Rear -> Series C").
- Call proposeChannelMappings exactly once with all results.`;

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
      getFitmentRegistryTool,
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
