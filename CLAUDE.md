# CLAUDE.md

## Project

SeplorX — Next.js 16 shipping management portal deployed on Vercel with Supabase PostgreSQL.

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict)
- **Database:** Supabase PostgreSQL via Drizzle ORM + postgres-js
- **Styling:** Tailwind CSS v4, shadcn/ui (New York style), Radix UI, Lucide icons
- **Validation:** Zod v4
- **AI Agents:** Vercel AI SDK (`ai` + `@ai-sdk/google`), Gemini 2.0 Flash
- **Deployment:** Vercel (serverless)
- **Package manager:** Yarn 1 (enforced via `preinstall` script — do not use npm/pnpm)

## Commands

```bash
yarn dev              # Start dev server
yarn build            # Production build
yarn lint             # ESLint
yarn knip             # Find unused code/deps
yarn fix              # lint --fix + knip --fix + build
yarn db:generate      # Generate Drizzle migrations
yarn db:migrate       # Run migrations (needs POSTGRES_URL_NON_POOLING, port 5432 direct)
yarn db               # Generate + migrate
yarn db:studio        # Drizzle Studio GUI
```

**Migration flow:** Migrations run automatically via GitHub Actions on every push to `main` (`.github/workflows/migrate.yml`). Vercel auto-deploys in parallel — schema is already up to date by the time the deployment goes live.

**Local:** Set `POSTGRES_URL_NON_POOLING` (port 5432 direct) in `.env.local` alongside `POSTGRES_URL` (port 6543 pooler). Never point `DATABASE_URL` at a MySQL URL — Drizzle uses the PostgreSQL driver.

## Project Structure

```
src/
├── app/
│   ├── agents/              # Agent Server Actions (approve/dismiss)
│   ├── api/agents/          # Agent API routes (POST triggers)
│   │   └── reorder/         # Low-stock reorder agent endpoint
│   ├── api/health/          # Health check endpoint
│   ├── apps/                # Shipping API integrations
│   ├── channels/            # E-commerce order channel integrations
│   │   ├── page.tsx         # Channel list
│   │   ├── actions.ts       # Server actions (create/disconnect/delete)
│   │   └── loading.tsx      # Skeleton
│   ├── api/channels/        # Channel OAuth callback routes
│   │   └── woocommerce/callback/route.ts  # Receives WooCommerce OAuth keys
│   ├── companies/           # Company management (CRUD, type: supplier/customer/both)
│   │   ├── page.tsx         # Company list
│   │   ├── actions.ts       # Server actions
│   │   ├── loading.tsx      # Skeleton
│   │   └── [id]/page.tsx    # Company detail
│   ├── products/            # Product catalog + stock tracking
│   ├── invoices/            # Purchase invoices + payments
│   ├── inventory/           # Inventory overview + stock alerts + AI reorder trigger
│   ├── page.tsx             # Dashboard
│   ├── layout.tsx           # Root layout with sidebar
│   └── error.tsx            # Global error boundary
├── components/
│   ├── agents/              # Agent UI components (trigger button, approval cards)
│   ├── apps/                # App integration components
│   ├── channels/            # Channel UI components (list, status badge, add wizard)
│   ├── companies/           # Company UI components
│   ├── layout/              # Layout components (sidebar)
│   └── ui/                  # shadcn/ui primitives
├── db/
│   ├── schema.ts            # Drizzle schema (all tables incl. agent_actions)
│   └── index.ts             # DB connection (globalForDb pattern)
├── hooks/                   # React hooks (use-mobile)
└── lib/
    ├── agents/              # AI agent system (registry, tools, agent logic)
    │   ├── registry.ts      # Agent definitions + enabled/disabled flags
    │   ├── reorder-agent.ts # Low-stock reorder agent (Gemini 2.0 Flash)
    │   └── tools/           # Typed read-only DB tools per agent
    ├── apps/                # App registry system
    ├── channels/            # Channel registry system
    │   ├── types.ts         # ChannelDefinition, ChannelInstance, ChannelType
    │   └── registry.ts      # channelRegistry[], getChannelById(), getPopularChannels()
    ├── validations/         # Zod schemas (apps, channels, companies, etc.)
    ├── crypto.ts            # AES-256-GCM encryption
    ├── env.ts               # Environment variable validation
    └── utils.ts             # cn() class merge helper
```

## Key Patterns

- **Path alias:** `@/*` maps to `./src/*`
- **DB connection:** `globalForDb` pattern, `max: 1` connection, PgBouncer (port 6543) handles pooling
- **App registry:** App definitions in TypeScript (`src/lib/apps/registry.ts`), DB stores only installations + config JSONB. See `docs/apps-integration.md`
- **Channel registry:** Channel type definitions in TypeScript (`src/lib/channels/registry.ts`), DB stores channel instances in `channels` table. Multiple instances of the same type allowed (multi-store). OAuth credentials stored encrypted in JSONB. See `docs/channels-integration.md`
- **Agent registry:** Agent definitions in TypeScript (`src/lib/agents/registry.ts`), `enabled` flag controls visibility. See `docs/agents.md`
- **Dynamic validation:** Zod schemas built at runtime from registry `configFields`
- **Server actions:** Mutations via `"use server"` actions with `useActionState` on client
- **Agent pattern:** Agents are reasoning-only (read-only DB tools); writes happen via existing Server Actions after human approval. Two-phase serverless-safe flow.

## Database

- Tables: `users`, `app_installations`, `channels`, `companies` (type: supplier/customer/both), `products`, `purchase_invoices`, `purchase_invoice_items`, `payments`, `inventory_transactions`, `agent_actions`, `settings`
- Migrations in `drizzle/` directory (PostgreSQL dialect)
- Use **port 6543** (transaction pooler) for the app, **port 5432** (direct) for migrations
- Decimal(12,2) for all money columns; integer for stock quantities

## Conventions

- Use Yarn for all package operations
- Drizzle queries use `db` from `@/db`, schema types from `@/db/schema`
- UI components follow shadcn/ui patterns with `cn()` from `@/lib/utils`
- shadcn/ui files in `src/components/ui/` are ignored by knip (standard exports)

## Architecture Principles

Follow these principles for all code changes (based on sound software architecture):

### Client vs Server Boundary (Next.js)

- **Server Components** (default): Data fetching, DB queries, business logic. Never import `useState`, `useEffect`, or browser APIs.
- **Client Components** (`"use client"`): Interactivity only — forms, dialogs, state, event handlers. Keep them thin; pass data via props from server components.
- **Server Actions** (`"use server"`): All mutations. Validate with Zod, handle errors, `revalidatePath`. Never call from server components directly.
- Data flows one way: **Server Component → props → Client Component → Server Action → revalidate**

### Scalability

- Write queries with explicit column selection (no `SELECT *`)
- Use DB transactions for multi-step mutations (read-check-write must be atomic)
- Keep server actions focused: one action = one operation
- Prefer DB-level constraints (unique indexes, FK checks) over application-level checks
- Use `sql` template for atomic field updates (e.g., `quantity + N`) instead of read-then-write

### Minimal Engineering

- Do the minimum required, but do it correctly
- No premature abstractions — extract only when there are 3+ concrete uses
- No speculative features, config flags, or "future-proofing"
- Three similar lines > one premature helper function
- If a pattern is used once, inline it. If used across modules, extract it.

### Error Handling

- Validate at boundaries (server actions receive untrusted FormData)
- Trust internal code — don't re-validate data between your own functions
- Use DB error codes (23505 = unique violation, 23503 = FK violation) for user-friendly messages
- Structured logging: `console.error("[actionName]", { contextId, error: String(err) })`

## Lint Rules

- React 19 strict lint: no `setState` inside `useEffect`, no ref access during render
- Use wrapper pattern in `useActionState` callback to close dialogs on success (see `company-dialog.tsx`)

## Design Docs

Read these before working on related features:

- `docs/architecture.md` — system architecture, layout, data flow patterns
- `docs/apps-integration.md` — apps registry pattern, how to add new apps/categories
- `docs/channels-integration.md` — channels registry pattern, WooCommerce OAuth flow, multi-instance design
- `docs/database.md` — all tables, JSONB config design, connection conventions
- `docs/business-modules.md` — companies, products, invoices, payments, inventory
