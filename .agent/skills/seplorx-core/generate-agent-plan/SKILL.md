---
name: generate-agent-plan
description: >
  Design and scope a new AI agent for SeplorX. Use when the user wants to automate a business
  reasoning task — such as detecting anomalies, suggesting pricing changes, analysing order patterns,
  flagging supplier issues, finding overdue payments, or recommending shipping carriers.
  Produces a complete agent design: what tools to build, what the agent should reason about,
  plan schema, and the approval workflow.
metadata:
  author: SeplorX
  version: "1.0"
---

# Generating a New Agent Plan for SeplorX

## When to Use This Skill

Use this skill when:
- A user describes a repetitive reasoning task that involves reading data and suggesting an action
- The task requires comparing multiple DB records to produce a recommendation
- The action requires human approval before execution (the default for SeplorX agents)

## Fitness Check — Is This a Good Agent Candidate?

Before designing an agent, verify:

| Question | Good sign | Bad sign |
|----------|-----------|----------|
| Does it read data and reason? | ✅ Yes | ❌ It just reads/displays data → use a Server Component |
| Does it produce a structured recommendation? | ✅ Yes | ❌ It just executes immediately → use a Server Action |
| Does a human need to approve before writes? | ✅ Yes | ❌ Fully automated writes → rethink the UX |
| Can it be done server-side without a UI loop? | ✅ Yes | ❌ Needs real-time back-and-forth → use a chat UI instead |

## Design Template

When designing a new agent, answer these questions:

### 1. Name & Purpose
- **Agent name:** (e.g. "Overdue Payment Chaser")
- **One-line description:** What does it detect and what action does it recommend?
- **Trigger page:** Where does the user click to run it?

### 2. Available Data (Read Tools)
List the DB tables and fields the agent needs to read:
```
Tool: getOverdueInvoices
  → Reads: purchase_invoices (status=unpaid, dueDate < now)
  → Returns: invoiceId, supplierId, amount, daysPastDue

Tool: getSupplierContact
  → Reads: companies (type includes 'supplier')
  → Returns: name, email, phone
```

### 3. Decision Logic (System Prompt)
Write a concrete step-by-step process the agent should follow:
```
1. Call getOverdueInvoices to find all unpaid invoices past due date.
2. If none, stop and report "No overdue invoices found."
3. For each invoice, call getSupplierContact to get contact details.
4. Group invoices by supplier.
5. For suppliers with >X days overdue, assign priority "high".
6. Call proposeChaseList once with the full structured recommendation.
```

### 4. Plan Schema (agent_actions.plan JSONB)
Define what JSON structure the agent will write to `agent_actions`:
```typescript
{
  chaseCandidates: [
    {
      supplierId: number,
      supplierName: string,
      invoices: { invoiceId: number, amount: string, daysPastDue: number }[],
      totalOwed: string,
      priority: "high" | "medium" | "low",
      rationale: string,
    }
  ],
  summary: string,
}
```

### 5. Approval Action
What happens when the user approves?
```
approveChaseList(taskId):
  → Reads plan from agent_actions
  → Creates chase_reminders records OR sends emails via the email app
  → Marks invoices as "chased"
  → agent_actions.status = 'executed'
```

### 6. UI Components Needed
- `chase-trigger.tsx` — button on `/invoices` page
- `chase-approval-card.tsx` — shows list of overdue suppliers with approve/dismiss

## Example Agent Ideas for SeplorX

| Agent | What it reads | What it recommends |
|-------|-------------|-------------------|
| **Overdue Payment Chaser** | `purchase_invoices` past due | Which suppliers to chase for payment |
| **Shipping Rate Optimiser** | Pending orders + configured carrier apps | Cheapest/fastest carrier per order |
| **Invoice Reconciler** | `purchase_invoice_items` vs `inventory_transactions` | Invoices where received qty ≠ billed qty |
| **Slow Stock Identifier** | `inventory_transactions` over last 90 days | Products with no outbound movement (deadstock) |
| **Supplier Performance Scorer** | `purchase_invoices`, `inventory_transactions` | Rank suppliers by on-time delivery + invoice accuracy |

## Output Format

After running this skill, produce:
1. A **registry entry** (copy-paste ready for `registry.ts`)
2. A **list of read tools** with DB tables + return fields
3. A **system prompt** with numbered steps and rules
4. A **plan schema** (TypeScript interface)
5. An **approval action** description
6. **UI components needed** (names + which page they live on)

Then hand off to the `add-new-agent` skill for implementation.
