# Architecture

## Overview

SeplorX is a shipping/logistics management portal. It serves as a central hub where users integrate third-party shipping APIs (Shree Maruti, Delhivery, DHL, FedEx, etc.) and manage shipments.

## System Design

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js App                           │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │ Dashboard│  │  CRUD    │  │  Agents   │  │   Apps    │  │
│  │    /     │  │  Pages   │  │/inventory │  │  /apps    │  │
│  └──────────┘  └──────────┘  └─────┬─────┘  └───────────┘  │
│                     │               │                        │
│         ┌───────────┴───────┐  ┌────┴──────────────────┐   │
│         │  Server Actions   │  │   Agent API Routes    │   │
│         │   (mutations)     │  │  /api/agents/reorder  │   │
│         └────────┬──────────┘  └────┬──────────────────┘   │
│                  │                  │                        │
│                  │           ┌──────┴──────────┐            │
│                  │           │  Agent (Gemini)  │            │
│                  │           │  read-only tools │            │
│                  │           │  → agent_actions │            │
│                  │           └─────────────────┘            │
│                  │                                           │
│         ┌────────┴────────┐                                 │
│         │   Drizzle ORM   │                                 │
│         └────────┬────────┘                                 │
└──────────────────┼──────────────────────────────────────────┘
                   │
          ┌────────┴────────┐
          │ Supabase PgSQL  │
          │ (port 6543)     │
          └─────────────────┘
```

## Layout

Sidebar navigation with two groups:

**Navigation**
- **Dashboard** (`/`) — overview and quick stats
- **Companies** (`/companies`) — supplier/customer management
- **Products** (`/products`) — product catalog + stock levels
- **Invoices** (`/invoices`) — purchase invoices + payments
- **Purchase Bills** (`/purchase/bills`) — purchase bill management
- **Inventory** (`/inventory`) — stock overview + alerts
- **Channels** (`/channels`) — e-commerce order channel integrations (WooCommerce, etc.)
- **Apps** (`/apps`) — logistics/payment/SMS API integrations

**AI**
- **Agents** (`/ai/agents`) — AI agent approval queue

The sidebar uses shadcn/ui's `Sidebar` component with `SidebarProvider` wrapping the root layout.

## Key Patterns

### 1. Registry Pattern (Apps + Channels + Agents)
Apps, channels, and agents are defined as TypeScript objects in their respective `registry.ts` files. The database only stores runtime state (installations, channel instances, agent_actions). This means:
- No metadata in the DB — the registry is the single source of truth
- Adding, disabling, or removing is a code-only change

App registry: `src/lib/apps/registry.ts` — see `docs/apps-integration.md`
Channel registry: `src/lib/channels/registry.ts` — see `docs/channels-integration.md`
Agent registry: `src/lib/agents/registry.ts` — see `docs/agents.md`

**Apps vs Channels**: Apps (logistics, payment, SMS) allow one installation per user per type, use API key config, and are managed via `app_installations`. Channels (WooCommerce, Shopify, Amazon) allow **multiple instances per type** (multi-store), use OAuth credentials, and are managed via `channels`.

### 2. Agent Layer (Two-Phase Approval)
Agents are reasoning engines, not execution engines. They can only read from core tables and write to `agent_actions`. All actual mutations go through existing validated Server Actions after human approval:

```
Agent (read-only tools) → plan JSON → agent_actions (pending_approval)
  ↓ human approves
Server Action (validated write) → core tables → revalidatePath
```

Phase 1 (serverless-safe): Agent runs, stores plan, returns immediately.
Phase 2 (separate request): User approves → Server Action executes write.

### 3. Server Components + Server Actions
- **Pages** are server components that read directly from the DB
- **Mutations** happen through server actions (`"use server"`)
- **Client components** handle interactivity (dialogs, forms, tabs)
- Data flows: Server Component → props → Client Component → Server Action → revalidatePath

### 3. JSONB Config Storage
Each app has different config fields (API keys, account IDs, etc.). Instead of a normalized key-value table, we use a single `jsonb` column. The app registry defines what fields exist, and Zod validates them dynamically.

### 4. Dynamic Validation
Zod schemas are built at runtime from the app registry's `configFields`. This keeps validation in sync with the registry automatically — no manual schema updates when adding apps.

## Software Architecture Principles

These principles guide all development decisions in SeplorX.

### 1. Respect the Client/Server Boundary

Next.js App Router enforces a clear separation between server and client code. This is the single most important architectural constraint.

**Server Components** (the default):
- Fetch data directly from the database
- Render HTML on the server
- Cannot use hooks (`useState`, `useEffect`), browser APIs, or event handlers
- Pass data down to client components via props

**Client Components** (`"use client"` directive):
- Handle user interactivity: forms, dialogs, click handlers, state
- Must be explicitly marked — keep them as thin as possible
- Receive data from server components via props; never query the DB directly
- Use `useActionState` for form submissions with server actions

**Server Actions** (`"use server"` directive):
- The only way to perform mutations (create, update, delete)
- Accept `FormData`, validate with Zod, interact with DB, call `revalidatePath`
- Return `{ success: true }` or `{ error: string }` — never throw to the client

**Data Flow:**
```
Server Component (fetch data)
  → props → Client Component (user interaction)
    → Server Action (validate + mutate)
      → revalidatePath (refresh server component)
```

### 2. Minimal Engineering

Do the minimum required work, but do it correctly:

- **No premature abstractions**: Extract shared code only when 3+ concrete callsites exist. Three similar lines of code is better than one premature helper.
- **No speculative features**: Don't add configuration, feature flags, or extensibility points for hypothetical future requirements.
- **No over-validation**: Validate at system boundaries (server actions receive untrusted FormData). Trust internal code — don't re-validate data flowing between your own functions.
- **Inline first, extract later**: If a pattern is used once, inline it. If it appears across multiple modules, extract it.

### 3. Scalable Database Patterns

- **Explicit column selection**: Always specify which columns to SELECT. Never use `SELECT *` or Drizzle's `select()` without column specs. This prevents fetching unnecessary data and makes the query contract explicit.
- **DB transactions for atomic operations**: Any read-check-write sequence must be wrapped in `db.transaction()`. Example: checking stock level before adjusting it.
- **Atomic field updates**: Use `sql` template literals for increment/decrement operations (e.g., `quantity + N`) instead of reading the value, computing in JS, then writing back.
- **DB-level constraints over app-level checks**: Rely on unique indexes, foreign key constraints, and check constraints. Handle their error codes (23505, 23503) for user-friendly messages.

### 4. Error Handling

- **Structured logging**: `console.error("[actionName]", { contextId, error: String(err) })` — always include the action name and relevant IDs.
- **Type-safe error narrowing**: Use `typeof err === "object" && "code" in err` instead of `as` type casts.
- **User-friendly messages**: Map known DB error codes to helpful messages. Use generic fallback for unknown errors.
- **Transaction error propagation**: Throw errors inside transactions, catch and parse outside. This keeps the transaction block clean.

### 5. Module-Level Constants

Static arrays and configuration objects should be defined at module level, not inside components. This avoids re-creation on every render and makes the data contract visible at file scope.

```typescript
// GOOD — defined once at module level
const PRODUCT_FIELDS = [
  { key: "name", label: "Product Name", required: true },
] as const;

// BAD — re-created every render
function MyComponent() {
  const fields = [{ key: "name", ... }]; // don't do this
}
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript (strict) |
| Database | Supabase PostgreSQL |
| ORM | Drizzle ORM + postgres-js |
| Styling | Tailwind CSS v4, shadcn/ui |
| Validation | Zod v4 |
| AI Agents | Vercel AI SDK (`ai`), `@ai-sdk/google`, Gemini 2.0 Flash |
| Icons | Lucide React |
| Deployment | Vercel (serverless) |
| Package Manager | Yarn 1 |

## Directory Structure

```
src/
├── app/                        # Next.js App Router
│   ├── apps/                   # Apps integration page
│   │   ├── page.tsx            # Server component (reads DB + registry)
│   │   ├── actions.ts          # Server actions (install/configure/uninstall)
│   │   └── loading.tsx         # Streaming skeleton
│   ├── channels/               # E-commerce channel integrations
│   │   ├── page.tsx            # Server component (reads channels table)
│   │   ├── actions.ts          # Server actions (create/disconnect/delete)
│   │   └── loading.tsx         # Streaming skeleton
│   ├── agents/
│   │   └── actions.ts          # Server actions (approve/dismiss agent tasks)
│   ├── api/
│   │   ├── health/             # Health check endpoint
│   │   ├── agents/
│   │   │   └── reorder/
│   │   │       └── route.ts    # POST — runs reorder agent, stores plan
│   │   └── channels/
│   │       └── woocommerce/
│   │           └── callback/
│   │               └── route.ts # POST — receives WooCommerce OAuth keys
│   ├── page.tsx                # Dashboard
│   ├── error.tsx               # Global error boundary
│   ├── layout.tsx              # Root layout with sidebar
│   └── globals.css             # Tailwind + design tokens
├── components/
│   ├── agents/                 # Agent UI components
│   │   ├── reorder-trigger.tsx # "AI Reorder Check" button
│   │   └── reorder-approval-card.tsx # Pending recommendation card
│   ├── apps/                   # App-specific components
│   │   ├── app-card.tsx        # Individual app card
│   │   ├── app-grid.tsx        # Responsive card grid
│   │   ├── app-config-dialog.tsx # Config form dialog
│   │   ├── app-icon.tsx        # Dynamic Lucide icon
│   │   ├── app-status-badge.tsx # Status badge
│   │   └── category-tabs.tsx   # Category tab navigation
│   ├── channels/               # Channel-specific components
│   │   ├── channel-list.tsx    # Table of connected channels
│   │   ├── channel-status-badge.tsx # pending/connected/disconnected badge
│   │   └── add-channel-wizard.tsx  # 4-step Dialog (select→name→prefs→connect)
│   ├── layout/                 # Layout components
│   │   └── app-sidebar.tsx     # Sidebar navigation
│   └── ui/                     # shadcn/ui primitives
├── db/
│   ├── schema.ts               # Drizzle schema (all tables)
│   └── index.ts                # DB connection + health check
└── lib/
    ├── agents/                 # Agent system
    │   ├── registry.ts         # Agent definitions + enabled flags
    │   ├── reorder-agent.ts    # Reorder agent (generateText + tools)
    │   └── tools/
    │       └── inventory-tools.ts # Read-only tools + proposeReorderPlan
    ├── apps/                   # App registry system
    │   ├── types.ts            # Type definitions
    │   ├── registry.ts         # App definitions + helpers
    │   └── index.ts            # Barrel export
    ├── channels/               # Channel registry system
    │   ├── types.ts            # ChannelDefinition, ChannelInstance, ChannelType
    │   ├── registry.ts         # channelRegistry[] (safe for clients)
    │   ├── handlers.ts         # getChannelHandler() (server-only logic)
    │   └── amazon/config.ts    # channel-specific configs
    ├── validations/            # Zod schemas
    │   ├── apps.ts             # App config validation
    │   └── channels.ts         # Channel create/delete validation
    ├── env.ts                  # Environment validation
    └── utils.ts                # cn() helper
```
