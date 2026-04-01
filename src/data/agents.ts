import { db } from "@/db";
import { agentActions, settings, channelProductMappings } from "@/db/schema";
import type { ChannelMappingPlan, ChannelMappingProposal } from "@/lib/agents/tools/channel-mapping-tools";
import { and, desc, eq, like } from "drizzle-orm";

export async function getPendingAgentTasks(agentType: string) {
  return await db
    .select({
      id: agentActions.id,
      plan: agentActions.plan,
      createdAt: agentActions.createdAt,
    })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.status, "pending_approval"),
        eq(agentActions.agentType, agentType)
      )
    )
    .orderBy(desc(agentActions.createdAt));
}

export async function getAgentActiveSettings() {
  return await db
    .select()
    .from(settings)
    .where(like(settings.key, "agent:%:isActive"));
}

export type PendingMappingInteraction = ChannelMappingProposal & {
  taskId: number;
  channelId: number;
  channelName: string;
};

/**
 * Fetches all pending channel mapping proposals across all active agent_actions rows.
 * Implicitly filters out proposals that have already been mapped (exist in channelProductMappings)
 * or that have been specifically dismissed.
 */
export async function getPendingChannelMappings(): Promise<PendingMappingInteraction[]> {
  const [actions, existingMappingsRows] = await Promise.all([
    db
      .select({
        id: agentActions.id,
        agentType: agentActions.agentType,
        plan: agentActions.plan,
      })
      .from(agentActions)
      .where(eq(agentActions.status, "pending_approval")),
      
    db
      .select({ externalProductId: channelProductMappings.externalProductId })
      .from(channelProductMappings)
  ]);

  const existingExtIds = new Set(existingMappingsRows.map((m) => m.externalProductId));
  const pendingProposals: PendingMappingInteraction[] = [];

  for (const action of actions) {
    if (action.agentType !== "channel_mapping" || !action.plan) continue;

    const plan = action.plan as unknown as ChannelMappingPlan;

    if (!Array.isArray(plan.proposals)) continue;

    for (const proposal of plan.proposals) {
      if (!existingExtIds.has(proposal.externalProductId)) {
        pendingProposals.push({
          ...proposal,
          taskId: action.id,
          channelId: plan.channelId,
          channelName: plan.channelName,
        });
      }
    }
  }

  return pendingProposals;
}

/**
 * Convenience method to return just the unique SeplorX Product IDs that currently
 * have at least one pending mapping proposal.
 */
export async function getProductsWithPendingMappings(): Promise<number[]> {
  const pendingMappings = await getPendingChannelMappings();
  const productIds = pendingMappings.map(p => p.seplorxProductId);
  return Array.from(new Set(productIds));
}

/**
 * Returns pending AI channel mapping proposals specific to a single SeplorX product ID.
 */
export async function getPendingMappingsForProduct(productId: number): Promise<PendingMappingInteraction[]> {
  const allMappings = await getPendingChannelMappings();
  return allMappings.filter(p => p.seplorxProductId === productId);
}
