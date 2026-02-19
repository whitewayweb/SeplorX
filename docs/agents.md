# AI Agents

SeplorX uses AI agents to automate repetitive reasoning tasks — things like detecting low stock, drafting purchase orders, and comparing shipping rates. Agents are an additive layer on top of the CRUD platform and cannot affect core functionality.

## Architecture Principle

**Agents are reasoning engines, not execution engines.**

```
Agent (read-only DB tools)
  → produces a Plan (JSON)
  → stored in agent_actions with status: pending_approval
  → human reviews and approves
  → existing Server Action executes the write
```

Agents never call `db.insert`, `db.update`, or `db.delete` on core tables. They only:
1. Read from existing tables via typed tools
2. Write to the `agent_actions` audit table (their own isolated table)

All actual writes go through the same validated Server Actions used by the rest of the app.

## Registry

All agents are defined in `src/lib/agents/registry.ts`. This is the single source of truth — mirrors the Apps registry pattern.

```typescript
export const AGENT_REGISTRY = {
  reorder: {
    id: "reorder",
    name: "Low-Stock Reorder Assistant",
    enabled: true,   // ← flip to false to disable
    route: "/api/agents/reorder",
    triggerPage: "/inventory",
  },
  // ... more agents
};
```

**To disable an agent:** Set `enabled: false`. Its API route returns 503 and its UI button is hidden. No other code changes.

**To enable an agent:** Set `enabled: true`. No other code changes.

## Isolation Guarantee

| Concern | How Isolated |
|---------|-------------|
| Agent crashes | Only fails its own API route; no effect on CRUD pages |
| Agent disabled | Route returns 503, button hidden, zero other code changes |
| Agent writes bad data | Cannot — agents only write to `agent_actions` |
| Two agents run simultaneously | No shared state; each writes its own `agent_actions` row |
| New agent added | New file + one registry entry; nothing else changes |
| Agent removed | Delete its file + registry entry; `agent_actions` rows remain as audit |

## The Two-Phase Pattern (Serverless-Safe)

Vercel serverless functions end after each response. You cannot pause an agent waiting for a human. The two-phase pattern solves this:

**Phase 1 — Reasoning (one serverless call, ~2–5 seconds):**
```
POST /api/agents/reorder
  → Agent runs read-only tools
  → Calls proposeReorderPlan tool → writes to agent_actions
  → Returns { taskId } to client
  → Function ends
```

**Phase 2 — Approval (separate user action):**
```
User clicks "Approve"
  → Server Action: approveReorderPlan(taskId)
  → Reads plan from agent_actions
  → Creates draft invoice via same DB transaction pattern as createInvoice
  → Updates agent_actions.status = 'executed'
  → revalidatePath
  → Function ends
```

## agent_actions Table

```sql
agent_actions (
  id            SERIAL PRIMARY KEY,
  agent_type    VARCHAR(100)    -- 'reorder', 'overdue', 'rate-compare'
  status        agent_status    -- pending_approval | approved | dismissed | executed | failed
  plan          JSONB           -- the agent's structured recommendation
  rationale     TEXT            -- the agent's natural language reasoning
  tool_calls    JSONB           -- audit trace of all tool calls made
  resolved_by   INTEGER         -- FK to users; who approved/dismissed
  created_at    TIMESTAMP
  resolved_at   TIMESTAMP
)
```

Query audit log: `yarn db:studio` → `agent_actions` table.

## File Structure

```
src/
├── app/
│   ├── agents/
│   │   └── actions.ts              # approveReorderPlan, dismissAgentTask Server Actions
│   └── api/agents/
│       └── reorder/route.ts        # POST /api/agents/reorder
├── components/agents/
│   ├── reorder-trigger.tsx         # "AI Reorder Check" button (client component)
│   └── reorder-approval-card.tsx   # Pending recommendation card (client component)
└── lib/agents/
    ├── registry.ts                 # Agent definitions (enable/disable here)
    ├── reorder-agent.ts            # Agent composition (generateText + tools)
    └── tools/
        └── inventory-tools.ts      # Read-only tools + proposeReorderPlan
```

## How to Add a New Agent

1. **Add to registry** (`src/lib/agents/registry.ts`):
   ```typescript
   myAgent: {
     id: "my-agent",
     name: "My Agent",
     description: "...",
     enabled: true,
     route: "/api/agents/my-agent",
     triggerPage: "/some-page",
   },
   ```

2. **Create tools** (`src/lib/agents/tools/my-agent-tools.ts`):
   - Only read tools (query existing tables)
   - One "propose" tool that writes to `agent_actions`

3. **Create agent** (`src/lib/agents/my-agent.ts`):
   - `generateText()` with `google("gemini-2.0-flash")` (import `google` from `@ai-sdk/google`)
   - System prompt with exact instructions
   - `stopWhen: stepCountIs(15)` (import `stepCountIs` from `ai`)

4. **Create API route** (`src/app/api/agents/my-agent/route.ts`):
   - Check `AGENT_REGISTRY.myAgent.enabled`
   - Check `process.env.GOOGLE_GENERATIVE_AI_API_KEY`
   - Call `runMyAgent()`

5. **Create Server Actions** (`src/app/agents/actions.ts`):
   - `approveMyAgentPlan()` — reads plan, calls existing write logic
   - `dismissAgentTask()` — already generic, reuse it

6. **Add UI** to the trigger page:
   - Server component: fetch `agent_actions` where `agent_type = 'my-agent'` and `status = 'pending_approval'`
   - Client component: approval card with approve/dismiss buttons

## Current Agents

| Agent | Status | Trigger | Value |
|-------|--------|---------|-------|
| Low-Stock Reorder | ✅ Enabled | `/inventory` → "AI Reorder Check" button | Drafts purchase order from supplier history |
| Overdue Invoice Reminder | 🔴 Disabled | `/invoices` | Drafts payment reminder emails |
| Carrier Rate Comparison | 🔴 Disabled | `/invoices/[id]` | Compares rates across configured carriers |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes (for agents) | Google Gemini API key. Free tier: 15 req/min, 1M tokens/day. |

Get a key at [aistudio.google.com](https://aistudio.google.com). Add to `.env.local` and Vercel environment variables.

## Upgrading the AI Model

The model is one line in each agent file, e.g. `src/lib/agents/reorder-agent.ts`:
```typescript
import { google } from "@ai-sdk/google";
// ...
model: google("gemini-2.0-flash"),
```

To upgrade to Claude or GPT-4:
```bash
yarn add @ai-sdk/anthropic   # or @ai-sdk/openai
```
Then swap the import and model string — everything else stays the same:
```typescript
import { anthropic } from "@ai-sdk/anthropic";
model: anthropic("claude-opus-4-6"),
```
