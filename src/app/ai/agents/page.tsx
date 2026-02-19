import { db } from "@/db";
import { settings } from "@/db/schema";
import { like } from "drizzle-orm";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { AgentCard } from "./agent-card";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  // Fetch all agent toggle settings (keys namespaced as agent:*:isActive)
  const settingsRows = await db
    .select()
    .from(settings)
    .where(like(settings.key, "agent:%:isActive"));

  const settingsMap = new Map(
    settingsRows.map((s) => [s.key, s.value as boolean])
  );

  const agents = Object.values(AGENT_REGISTRY).map(agent => {
    const key = `agent:${agent.id}:isActive`;
    return {
      ...agent,
      isActive: settingsMap.get(key) ?? agent.enabled,
    };
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">AI Agents</h1>
        <p className="text-muted-foreground mt-2">
          Manage and configure your intelligent assistants to help with data entry and purchasing.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map(agent => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
