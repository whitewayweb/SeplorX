import { db } from "@/db";
import { agentActions, settings } from "@/db/schema";
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
