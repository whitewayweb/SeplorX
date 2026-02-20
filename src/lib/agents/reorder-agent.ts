/**
 * Reorder Agent — Low-Stock Purchase Order Drafter
 *
 * Flow:
 * 1. Calls getLowStockProducts → finds products needing reorder
 * 2. For each product, calls getPreferredSupplier → finds historical supplier
 * 3. Calls getLastOrderQuantity → determines how much to order
 * 4. Groups items by supplier (targets the top supplier for a consolidated order)
 * 5. Calls proposeReorderPlan → saves to agent_actions for human approval
 *
 * Agents are reasoning engines, not execution engines.
 * All writes to core tables happen via Server Actions after human approval.
 */

import { generateText, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import {
  getLowStockProducts,
  getPreferredSupplier,
  getLastOrderQuantity,
  proposeReorderPlan,
} from "./tools/inventory-tools";

const SYSTEM_PROMPT = `You are a purchasing assistant for a shipping management company.
Your job is to check inventory, identify products that need to be reordered, and draft a purchase order recommendation for human review.

Follow this process exactly:
1. Call getLowStockProducts to get all products that need reordering.
2. If no products are low on stock, stop and explain that inventory is healthy.
3. For each low-stock product, call getPreferredSupplier to find who usually supplies it.
4. For products with a known supplier, call getLastOrderQuantity to determine how much was ordered last time.
5. Group all products that share the same top supplier into one order. Focus on the supplier with the most products.
6. For each item, use the last order quantity as the recommended quantity (or reorder_level * 2 if no history).
7. Call proposeReorderPlan once with the consolidated recommendation.

Rules:
- Only propose one order per agent run (for the top supplier by product count).
- If a product has no supplier history, mention it in your reasoning but do not include it in the draft order.
- Use the lastUnitPrice from getPreferredSupplier as the unitPrice estimate.
- Be concise in rationale fields — one sentence per item is enough.`;

export async function runReorderAgent(): Promise<{ taskId: number } | { message: string } | { error: string }> {
  const result = await generateText({
    model: google("gemini-2.5-flash"),
    system: SYSTEM_PROMPT,
    prompt: "Check inventory now and draft a reorder recommendation if needed.",
    tools: {
      getLowStockProducts,
      getPreferredSupplier,
      getLastOrderQuantity,
      proposeReorderPlan,
    },
    stopWhen: stepCountIs(15),
  });

  // Check if the agent produced a proposal (tool result from proposeReorderPlan)
  for (const toolResult of result.toolResults) {
    if (
      toolResult.toolName === "proposeReorderPlan" &&
      "output" in toolResult &&
      toolResult.output &&
      typeof toolResult.output === "object" &&
      "taskId" in toolResult.output
    ) {
      return { taskId: (toolResult.output as { taskId: number }).taskId };
    }
  }

  // Agent finished without a proposal (inventory is healthy or no supplier history)
  return { message: result.text || "Inventory check complete. No reorder needed at this time." };
}
