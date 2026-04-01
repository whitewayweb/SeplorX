---
name: agents
description: >
  How to add a new AI agent to SeplorX. Use when implementing a new agent feature,
  creating a new AI-powered automation, or extending the agent registry with a new
  reasoning task. Covers: registry entry, read-only tools, agent file, API route,
  Server Actions for approval, and UI trigger + approval card components.
metadata:
  author: SeplorX
  version: "1.0"
---

# Adding a New Agent to SeplorX

## Core Principle

**Agents are reasoning engines, not execution engines.**

```
Agent (read-only DB tools)
  → produces a Plan (JSON)
  → stored in agent_actions with status: pending_approval
  → human reviews + approves
  → existing Server Action executes the write
```

Agents **never** call `db.insert`, `db.update`, or `db.delete` on core tables. They only read via typed tools and write to the `agent_actions` audit table.

## The Two-Phase Pattern (Serverless-Safe)

Vercel functions terminate after each response — you cannot pause an agent to wait for human input. The two-phase pattern solves this:

**Phase 1 — Reasoning** (one serverless call, ~2–5s):
```
POST /api/agents/my-agent
  → Agent runs read-only tools
  → Calls proposeMyAgentPlan tool → writes to agent_actions
  → Returns { taskId } to client
  → Function ends
```

**Phase 2 — Approval** (separate user action):
```
User clicks "Approve"
  → Server Action: approveMyAgentPlan(taskId)
  → Reads plan from agent_actions
  → Executes writes via existing DB transaction pattern
  → agent_actions.status = 'executed'
  → revalidatePath
```

## Step-by-Step Implementation

### 1. Register the Agent

Add one entry to `src/lib/agents/registry.ts`:

```typescript
myAgent: {
  id: "my-agent",
  name: "My Agent Display Name",
  description: "What it does in one sentence.",
  enabled: true,
  route: "/api/agents/my-agent",
  triggerPage: "/some-page",  // where the trigger button lives
},
```

Set `enabled: false` to hide it without deleting code. The API route will return 503 automatically.

### 2. Create Read-Only Tools

Create `src/lib/agents/tools/my-agent-tools.ts`:

```typescript
import { tool } from "ai";
import { z } from "zod";
import { db } from "@/db";

// Read tools — query existing tables, never mutate core tables
export const getMyData = tool({
  description: "Fetches ... from the database.",
  parameters: z.object({ userId: z.number() }),
  execute: async ({ userId }) => {
    return db.select({ id: t.id, name: t.name }).from(t)
      .where(eq(t.userId, userId));  // always scope to userId
  },
});

// Propose tool — the ONLY write tool; writes to agent_actions only
export const proposeMyAgentPlan = tool({
  description: "Saves the agent's recommendation for human review.",
  parameters: z.object({
    plan: z.object({ /* structured plan schema */ }),
    rationale: z.string(),
  }),
  execute: async ({ plan, rationale }) => {
    const [row] = await db.insert(agentActions).values({
      agentType: "my-agent",
      status: "pending_approval",
      plan,
      rationale,
    }).returning({ id: agentActions.id });
    return { taskId: row.id };
  },
});
```

### 3. Create the Agent File

Create `src/lib/agents/my-agent.ts`:

```typescript
import { generateText, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { getMyData, proposeMyAgentPlan } from "./tools/my-agent-tools";

const SYSTEM_PROMPT = `You are a ... assistant.
Follow this exact process:
1. Call getMyData to ...
2. If ..., stop and explain.
3. Call proposeMyAgentPlan once with the recommendation.

Rules:
- Only propose if ...
- Keep rationale concise — one sentence per item.`;

export async function runMyAgent(
  userId: number,
): Promise<{ taskId: number } | { message: string } | { error: string }> {
  const result = await generateText({
    model: google("gemini-2.0-flash"),  // or gemini-2.5-flash for complex reasoning
    system: SYSTEM_PROMPT,
    prompt: `Run analysis for userId: ${userId}`,
    tools: { getMyData, proposeMyAgentPlan },
    stopWhen: stepCountIs(15),  // safety cap on tool call loops
  });

  for (const toolResult of result.toolResults) {
    if (
      toolResult.toolName === "proposeMyAgentPlan" &&
      "output" in toolResult &&
      toolResult.output &&
      typeof toolResult.output === "object" &&
      "taskId" in toolResult.output
    ) {
      return { taskId: (toolResult.output as { taskId: number }).taskId };
    }
  }

  return { message: result.text || "Analysis complete. No action needed." };
}
```

### 4. Create the API Route

Create `src/app/api/agents/my-agent/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { runMyAgent } from "@/lib/agents/my-agent";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function POST() {
  if (!AGENT_REGISTRY.myAgent.enabled) {
    return NextResponse.json({ error: "Agent disabled" }, { status: 503 });
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }
  const userId = await getAuthenticatedUserId();
  const result = await runMyAgent(userId);
  if ("error" in result) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
```

### 5. Add Server Actions

Add to `src/app/agents/actions.ts`:

```typescript
export async function approveMyAgentPlan(taskId: number) {
  "use server";
  const userId = await getAuthenticatedUserId();
  // 1. Read plan from agent_actions (scope to userId)
  // 2. Execute writes via existing service functions / db.transaction
  // 3. Update agent_actions.status = 'executed', resolved_by = userId
  revalidatePath("/some-page");
}
// dismissAgentTask is already generic — reuse it directly
```

### 6. Add UI

In the trigger page (Server Component):
```typescript
// Fetch pending plans for this agent
const pendingPlans = await db.select().from(agentActions)
  .where(and(
    eq(agentActions.agentType, "my-agent"),
    eq(agentActions.status, "pending_approval"),
    eq(agentActions.userId, userId),
  ));
```

Create Client Components:
- `src/components/organisms/agents/my-agent-trigger.tsx` — button that calls `POST /api/agents/my-agent`
- `src/components/organisms/agents/my-agent-approval-card.tsx` — shows plan + approve/dismiss buttons

## agent_actions Schema

```typescript
// In src/db/schema.ts
agentActions: {
  id, agentType, status,  // pending_approval | approved | dismissed | executed | failed
  plan,        // JSONB — the structured recommendation
  rationale,   // TEXT — natural language reasoning
  toolCalls,   // JSONB — audit trace of all tool calls made
  resolvedBy,  // FK to users
  createdAt, resolvedAt
}
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Required for all agents. Get at aistudio.google.com |
| `OPENROUTER_KEY` | Optional. Primary provider for channel mapping agent. Get at openrouter.ai |

## Common Mistakes to Avoid

- ❌ Writing to core tables inside a tool — only write to `agent_actions`
- ❌ Using `fetch()` inside the agent to call internal routes — call functions directly
- ❌ Omitting `stopWhen: stepCountIs(N)` — always cap tool call loops
- ❌ Not scoping DB queries by `userId` in tool implementations — always add ownership filter
- ❌ Forgetting `enabled` check in the API route — the registry flag is only enforced there
