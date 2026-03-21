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
│   │   ├── reorder/         # Low-stock reorder agent endpoint
│   │   └── channel-mapping/ # Channel product mapper agent endpoint
│   ├── api/health/          # Health check endpoint
│   ├── apps/                # Shipping API integrations
│   ├── channels/            # E-commerce order channel integrations
│   │   ├── page.tsx         # Channel list
│   │   ├── actions.ts       # Server actions (create/disconnect/delete)
│   │   └── loading.tsx      # Skeleton
│   ├── api/channels/        # Channel OAuth callback + webhook routes
│   │   └── [type]/
│   │       ├── callback/route.ts          # Generic OAuth callback (type = woocommerce, etc.)
│   │       └── webhook/[channelId]/route.ts  # Webhook receiver for each channel instance
│   ├── companies/           # Company management (CRUD, type: supplier/customer/both)
│   │   ├── page.tsx         # Company list
│   │   ├── actions.ts       # Server actions
│   │   ├── loading.tsx      # Skeleton
│   │   └── [id]/page.tsx    # Company detail
│   ├── products/            # Product catalog + stock tracking + channel sync
│   ├── invoices/            # Purchase invoices + payments
│   ├── inventory/           # Inventory overview + stock alerts + AI reorder trigger
│   ├── page.tsx             # Dashboard
│   ├── layout.tsx           # Root layout with sidebar
│   └── error.tsx            # Global error boundary
├── components/
│   ├── atoms/               # Custom UI primitives, providers, icons
│   ├── ui/                  # shadcn/ui primitives
│   ├── molecules/           # Simple functional groupings
│   ├── organisms/           # High-visibility feature blocks
│   │   ├── agents/          # Agent components (approval cards, etc)
│   │   ├── apps/            # App integration components
│   │   ├── channels/        # Channel components (products table, wizard)
│   │   ├── companies/       # Company UI components
│   │   ├── invoices/        # Invoice UI components
│   │   ├── products/        # Product mapping & catalogs
│   │   └── layout/          # Sidebar & app shell components
│   └── templates/           # Layout shells without data hooks
├── db/
│   ├── schema.ts            # Drizzle schema (all tables incl. agent_actions)
│   └── index.ts             # DB connection (globalForDb pattern)
├── hooks/                   # React hooks (use-mobile)
└── lib/
    ├── agents/              # AI agent system (registry, tools, agent logic)
    │   ├── registry.ts      # Agent definitions + enabled/disabled flags
    │   ├── reorder-agent.ts # Low-stock reorder agent (Gemini 2.0 Flash)
    │   ├── channel-mapping-agent.ts  # Channel product mapper agent (Gemini 2.0 Flash)
    │   └── tools/           # Typed read-only DB tools per agent
    │       ├── inventory-tools.ts
    │       └── channel-mapping-tools.ts  # getSeplorxProducts, getChannelProducts, proposeChannelMappings
    ├── apps/                # App registry system
    ├── channels/            # Channel registry system + handler interface
    │   ├── types.ts         # ChannelDefinition, ChannelInstance, ChannelHandler, ExternalProduct
    │   ├── registry.ts      # channelRegistry[], getChannelById(), getChannelHandler()
    │   └── woocommerce/
    │       └── index.ts     # woocommerceHandler (implements ChannelHandler)
    ├── validations/         # Zod schemas (apps, channels, companies, etc.)
    ├── crypto.ts            # AES-256-GCM encryption
    ├── env.ts               # Environment variable validation
    └── utils.ts             # cn() class merge helper
```

## Key Patterns

- **Path alias:** `@/*` maps to `./src/*`
- **DB connection:** `globalForDb` pattern, `max: 1` connection, PgBouncer (port 6543) handles pooling
- **App registry:** App definitions in TypeScript (`src/lib/apps/registry.ts`), DB stores only installations + config JSONB. See `docs/apps-integration.md`
- **Channel registry:** Channel type definitions in TypeScript (`src/lib/channels/registry.ts`), DB stores channel instances in `channels` table. Multiple instances of the same type allowed (multi-store). OAuth credentials stored encrypted in JSONB. Per-channel logic lives in `ChannelHandler` implementations (e.g. `src/lib/channels/woocommerce/index.ts`). See `docs/channels-integration.md`
- **Agent registry:** Agent definitions in TypeScript (`src/lib/agents/registry.ts`), `enabled` flag controls visibility. See `docs/agents.md`
- **Dynamic validation:** Zod schemas built at runtime from registry `configFields`
- **Server actions:** Mutations via `"use server"` actions with `useActionState` on client
- **Auth pattern:** Uses `better-auth` for authentication. Server config and helpers in `src/lib/auth/index.ts`, client hooks in `src/lib/auth/client.ts`. The `src/proxy.ts` Edge middleware validates session tokens against the Better Auth API (not just cookie presence) and redirects unauthenticated users to `/login`. The shared helper `getAuthenticatedUserId()` is used in all Server Components and Server Actions to obtain the authenticated user's ID — never hardcode user IDs. Uses `emailAndPassword` plugin for native login. All dashboard routes are grouped inside `src/app/(dashboard)/`.
- **Dynamic Field Extraction:** Server Actions that handle multi-tab/dynamic forms (like `updateChannelProductDetails`) should extract fields from `FormData` by iterating over the keys of the target Zod schema (`Object.keys(Schema.shape)`). This prevents field loss when the form structure changes and ensures the action remains a thin, type-safe gateway to the service layer.
- **Agent pattern:** Agents are reasoning-only (read-only DB tools); writes happen via existing Server Actions after human approval. Two-phase serverless-safe flow.

## Database

- Tables: `users`, `app_installations`, `channels`, `channel_product_mappings`, `channel_product_changelog`, `companies` (type: supplier/customer/both), `products`, `purchase_invoices`, `purchase_invoice_items`, `payments`, `inventory_transactions`, `agent_actions`, `settings`
- All tables have RLS enabled — chain `.enableRLS()` on every new `pgTable(...)` call
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
- **JSONB column access:** Only extract the sub-fields you actually use from JSONB blobs. Use Drizzle's `sql<T>\`${table.col}->>'field'\`` syntax instead of fetching the entire `rawData`/`credentials` column when only scalar sub-fields are needed. This avoids deserialising large blobs unnecessarily.
- **Scalable JSONB Querying:** When filtering or organizing globally against channel-specific JSONB payloads (e.g., getting unique brands, categories, or prices), avoid massive global `CASE` statements. Instead, delegate the JSONB Drizzle SQL extraction to `handler.extractSqlField(fieldName)`. The specific extraction logic must live inside `src/lib/channels/{channel_id}/queries.ts`.
  - **Note:** Standard fields like `title` (`name`), `sku`, and `stockQuantity` are strictly maintained as **native top-level PostgreSQL columns** (`channelProducts.name`, `channelProducts.stockQuantity`) because they are heavily indexed and updated often. You **do not** need to use JSONB `extractSqlField` logic for these; just use standard Drizzle querying (`eq(channelProducts.sku, "123")`).
- Use DB transactions for multi-step mutations (read-check-write must be atomic)
- Keep server actions focused: one action = one operation
- Prefer DB-level constraints (unique indexes, FK checks) over application-level checks
- Use `sql` template for atomic field updates (e.g., `quantity + N`) instead of read-then-write
- **Registry / expensive module-level work:** Initialise once at module scope (`let cache: T | null = null`) and guard with `if (!cache)`. Suppress noisy logs in production with `if (process.env.NODE_ENV !== 'production')`. Expose a `refresh*()` escape-hatch for dev hot-reload.

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
- **Structured logging**: `console.error("[actionName]", { contextId, error: String(err) })`

### Security

- **Always validate untrusted identifiers at the action boundary.** FormData fields that control which DB rows are mutated (e.g. `id`, `channelId`, `externalId`) must pass through a Zod schema before use — not just a `parseInt` / truthiness check. Add these to `src/lib/validations/channels.ts`.
- **IDOR prevention — service layer:** When a service function accepts a row ID supplied by client-side code, add an ownership constraint to the query. For example: `where(eq(table.id, rowId), eq(foreignTable.userId, userId))` via a JOIN, not just `where(eq(table.id, rowId))`. This pattern is used in `pollFeedStatus`, `deleteAmazonFeedRecordForUser`, and `getChannelForUser`.
- **IDOR prevention — page layer:** Sensitive server-component pages must call `getAuthenticatedUserId()` and use user-scoped queries (e.g. `getChannelForUser(userId, channelId)` instead of `getChannel(channelId)`). Return `notFound()` for both missing rows and unauthorized access — never leak row existence.
- **Multi-write atomicity:** Any function that performs two or more dependent DB writes must wrap them in `db.transaction(async (tx) => { ... })`. A partial write leaves state machines (sync status enums, audit tables) inconsistent. See `updateProduct`, `updateChannelProductService`.

### Performance & Data Integrity

- **Middleware Auth**: Call `auth.api.getSession()` directly from `@/lib/auth`. **NEVER** use `fetch()` to an internal API route inside `src/proxy.ts` (middleware), as it adds ~2s latency and causes re-render loops.
- **Safe Upserts**: Use the `COALESCE(NULLIF(EXCLUDED.col, ''), table.col)` pattern in `onConflictDoUpdate` to prevent overwriting existing data with empty strings or nulls during partial syncs.
- **Column Selection**: Always specify columns in `select()` (e.g. `db.select({ id: t.id }).from(t)`). Avoid fetching entire JSONB blobs (`rawData`, `credentials`) unless explicitly needed.
- **Batched Processing**: Process large external API results (like Amazon reports) in batches (e.g., 100 items) to prevent memory exhaustion and respect DB connection limits.
- **Case-Insensitive Parsing**: Always map external report headers to lowercase and use fuzzy matching (aliases) for common fields like `sku`, `asin`, or `qty` to ensure compatibility with varying marketplace exports.

## Lint Rules

- React 19 strict lint: no `setState` inside `useEffect`, no ref access during render
- Use wrapper pattern in `useActionState` callback to close dialogs on success (see `company-dialog.tsx`)

- Never add `_` to a variable name to bypass ESLint (e.g. `_channelWebhookBaseUrl`). Remove unused variables from the signature unless they are non-trailing and required for position.

## Design Docs

Read these before working on related features:

- `docs/architecture.md` — system architecture, layout, data flow patterns
- `docs/apps-integration.md` — apps registry pattern, how to add new apps/categories
- `docs/channels-integration.md` — channels registry pattern, WooCommerce OAuth flow, multi-instance design
- `docs/database.md` — all tables, JSONB config design, connection conventions
- `docs/business-modules.md` — companies, products, invoices, payments, inventory

## AI Agent Instructions (Mandatory Reconnaissance)

To prevent hallucinations, redundant files, and ignored typings, **all AI agents MUST follow these reconnaissance steps before writing code:**

1. **Directory Reconnaissance**: Before creating *any* new file (especially inside `src/lib/channels/*` or `src/lib/apps/*`), run `list_dir` on the target directory. If a file serving a similar purpose exists (e.g., `queries.ts`), integrate the new code into the existing file instead of creating a new one (e.g., `order-queries.ts`).
2. **Type Discovery (Generated APIs)**: Before writing manual TypeScript interfaces for external API payloads or database schemas, search the codebase (via `grep_search` or `list_dir`) for existing generated types (e.g., `ordersV0Schema.ts`). Always use and import the official generated types from the `api/types/` directory instead of hacking together local ad-hoc interfaces.
3. **No Speculative Abstractions**: Do not create wrappers or types just "to make it easier." Use the exact types outputted by the generation scripts and project layout as found in existing files.
