# CLAUDE.md

## Project

SeplorX — Next.js 16 shipping management portal deployed on Vercel with Supabase PostgreSQL.

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict)
- **Database:** Supabase PostgreSQL via Drizzle ORM + postgres-js
- **Styling:** Tailwind CSS v4, shadcn/ui (New York style), Radix UI, Lucide icons
- **Validation:** Zod v4
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
yarn db:migrate       # Run migrations (needs direct connection URL, port 5432)
yarn db               # Generate + migrate
yarn db:studio        # Drizzle Studio GUI
```

## Project Structure

```
src/
├── app/
│   ├── apps/               # Shipping API integrations
│   ├── companies/           # Company management (CRUD, type: supplier/customer/both)
│   │   ├── page.tsx         # Company list
│   │   ├── actions.ts       # Server actions
│   │   ├── loading.tsx      # Skeleton
│   │   └── [id]/page.tsx    # Company detail
│   ├── products/            # Product catalog (planned)
│   ├── invoices/            # Purchase invoices (planned)
│   ├── inventory/           # Inventory overview (planned)
│   ├── api/health/          # Health check endpoint
│   ├── page.tsx             # Dashboard
│   ├── layout.tsx           # Root layout with sidebar
│   └── error.tsx            # Global error boundary
├── components/
│   ├── apps/                # App integration components
│   ├── companies/           # Company UI components
│   ├── layout/              # Layout components (sidebar)
│   └── ui/                  # shadcn/ui primitives
├── db/
│   ├── schema.ts            # Drizzle schema (all tables)
│   └── index.ts             # DB connection (globalForDb pattern)
├── hooks/                   # React hooks (use-mobile)
└── lib/
    ├── apps/                # App registry system
    ├── validations/         # Zod schemas (apps, companies, etc.)
    ├── crypto.ts            # AES-256-GCM encryption
    ├── env.ts               # Environment variable validation
    └── utils.ts             # cn() class merge helper
```

## Key Patterns

- **Path alias:** `@/*` maps to `./src/*`
- **DB connection:** `globalForDb` pattern, `max: 1` connection, PgBouncer (port 6543) handles pooling
- **App registry:** App definitions in TypeScript (`src/lib/apps/registry.ts`), DB stores only installations + config JSONB. See `docs/apps-integration.md`
- **Dynamic validation:** Zod schemas built at runtime from registry `configFields`
- **Server actions:** Mutations via `"use server"` actions with `useActionState` on client

## Database

- Tables: `users`, `app_installations`, `companies` (type: supplier/customer/both), `products`, `purchase_invoices`, `purchase_invoice_items`, `payments`, `inventory_transactions`
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
- `docs/database.md` — all tables, JSONB config design, connection conventions
- `docs/business-modules.md` — companies, products, invoices, payments, inventory
