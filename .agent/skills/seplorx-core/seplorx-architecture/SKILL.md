---
name: seplorx-architecture
description: >
  SeplorX project conventions, architecture patterns, and coding rules for the Next.js 16 shipping
  management portal. Use when writing any code, adding features, refactoring, or debugging in SeplorX.
  Covers App Router client/server boundary, Drizzle ORM usage, Server Actions, Zod validation,
  security (IDOR prevention), authentication, error handling, and design principles.
metadata:
  author: SeplorX
  version: "1.0"
---

# SeplorX Architecture

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

**Migration flow:** Migrations run automatically via GitHub Actions on every push to `main` (`.github/workflows/migrate.yml`). Vercel auto-deploys in parallel.
**Local:** Set `POSTGRES_URL_NON_POOLING` (port 5432 direct) in `.env.local` alongside `POSTGRES_URL` (port 6543 pooler).

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict)
- **Database:** Supabase PostgreSQL via Drizzle ORM + postgres-js
- **Styling:** Tailwind CSS v4, shadcn/ui (New York style), Radix UI, Lucide icons
- **Validation:** Zod v4
- **AI Agents:** Vercel AI SDK (`ai` + `@ai-sdk/google`), Gemini 2.0 Flash
- **Package manager:** Yarn 1 only (never npm or pnpm)
- **Path alias:** `@/*` maps to `./src/*`

## Client / Server Boundary (Critical)

| Layer | Rule |
|-------|------|
| **Server Components** (default) | Data fetching, DB queries, business logic. Never import `useState`, `useEffect`, or browser APIs. |
| **Client Components** (`"use client"`) | Interactivity only — forms, dialogs, state, event handlers. Keep thin; receive data via props. |
| **Server Actions** (`"use server"`) | All mutations. Validate with Zod, handle errors, call `revalidatePath`. Never call from Server Components directly. |

Data flows one way: **Server Component → props → Client Component → Server Action → revalidate**

## Authentication

- Auth uses `better-auth`. Server config and helpers are in `src/lib/auth/index.ts`, client hooks in `src/lib/auth/client.ts`.
- **Always call `getAuthenticatedUserId()`** in Server Components and Server Actions to get the current user's ID. Never hardcode user IDs.
- The Next.js 16 proxy middleware is at `src/proxy.ts`. **Use `getSessionCookie(request)` from `better-auth/cookies`** for fast, optimistic route protection. **Never use `fetch()` or full DB validation in proxy.ts** inside this app because it adds ~2s latency and recursion loops. Real security validations happen in Server Components via `getAuthenticatedUserId()`.
- All dashboard routes live inside `src/app/(dashboard)/`.

## Security — IDOR Prevention (Mandatory)

- **FormData identifiers** (ids like `channelId`, `productId`) that control which DB rows are mutated **must** pass through a Zod schema before use.
- **Service layer:** When accepting a row ID from client code, add an ownership constraint: `where(eq(table.id, rowId), eq(table.userId, userId))`. Not just `where(eq(table.id, rowId))`.
- **Page layer:** Server component pages must call `getAuthenticatedUserId()` and use user-scoped queries (e.g. `getChannelForUser(userId, channelId)`). Return `notFound()` for both missing and unauthorized — never leak row existence.

## Database Queries

- **Tables:** `users`, `sessions`, `accounts`, `app_installations`, `channels`, `channel_products`, `channel_product_mappings`, `channel_product_changelog`, `channel_feeds`, `companies` (type: supplier/customer/both), `products`, `purchase_invoices`, `purchase_invoice_items`, `payments`, `inventory_transactions`, `agent_actions`, `settings`, `sales_orders`, `sales_order_items`, `stock_reservations`. (All have RLS). Decimal(12,2) for money; integer for stock.
- **Data Access Layer (DAL)** (`src/data/*.ts`):
  - Pure TypeScript functions containing raw SQL/Drizzle queries.
  - Extracts reusable Read logic away from UI components (Server Components) and Server Actions.
  - **CRITICAL**: Server Components configure standard fetch via DAL. Never put `db.select()` in a `page.tsx`.
  - **Logic Purity**: The DAL should return data in a "Ready-to-Render" state.
- **Connection:** Port 6543 (transaction pooler) via `globalForDb` wrapper. Port 5432 for migrations.
- **Always select explicit columns** — no `SELECT *`. Use `db.select({ id: t.id, name: t.name }).from(t)`.
- **JSONB columns:** Only extract sub-fields you need via Drizzle's `sql<T>\`${table.col}->>'field'\`` syntax. Never fetch entire `rawData` or `credentials` blobs unless needed.
- **Scalable JSONB filtering:** Delegate JSONB field extraction logic to `handler.extractSqlField(fieldName)` in `src/lib/channels/{channel_id}/queries.ts`. Don't write global `CASE` statements.
- **Standard fields** (`name`, `sku`, `stockQuantity`) are native top-level Postgres columns — use standard Drizzle querying, not JSONB extraction.
- **Atomic field updates:** Use `sql` template (e.g. `quantity + N`) instead of read-then-write.
- **Multi-step mutations:** Wrap in `db.transaction(async (tx) => { ... })`.
- Use DB error codes for user-friendly messages: `23505` = unique violation, `23503` = FK violation.

## Error Handling

- Validate at boundaries (Server Actions receive untrusted `FormData`).
- Trust internal code — don't re-validate between your own functions.
- Structured logging: `console.error("[actionName]", { contextId, error: String(err) })`

## Performance

- **Query Parallelization:** Always use `Promise.all` for independent `db.select()` queries on dashboard pages to prevent waterfall delays. 
- **Memoized Auth:** Always wrap `getAuthenticatedSession` in React's `cache()` to prevent redundant DB calls within a single request cycle.
- **N+1 Queries:** Never loop independent queries (e.g., checking duplicates in a `for` loop). Use `inArray` to fetch in batches.
- **Batched processing:** Process large API results (e.g. Amazon reports) in batches of 100 items. 
- **Safe upserts:** Use `COALESCE(NULLIF(EXCLUDED.col, ''), table.col)` in `onConflictDoUpdate` to prevent overwriting with empty strings during partial syncs.
- **Module-level caching:** Initialise once at module scope (`let cache: T | null = null`) and guard with `if (!cache)`. Expose a `refresh*()` escape-hatch for dev hot-reload.

## UI & Layout Patterns

- **Shadcn Forms & Validation (Compulsory)**: All forms MUST use the `shadcn` Form components (`react-hook-form` + `@hookform/resolvers/zod`). Always wrap inputs in `<Form>`, `<FormField>`, `<FormItem>`, `<FormLabel>`, `<FormControl>`, and `<FormMessage>`. Always use Zod schemas to validate form values both on the client and server.
- **Searchable Dropdowns**: Whenever a searchable dropdown is required, you must use the Shadcn `Combobox` pattern (which combines `<Popover>` and `<Command>` components), exactly as described in the official Shadcn inline docs. Do not build custom `<datalist>` elements or raw input hacks.
- **PageHeader Molecule**: Use `<PageHeader title="..." description="..." />` from `@/components/molecules/layout/page-header` for all dashboard pages. This component handles the 48px left-margin (`ml-12`) needed to clear the floating sidebar trigger.
- **No `container mx-auto`**: Dashboard pages should use `p-6 space-y-6` on the root div. Avoid `container` or `mx-auto` as they conflict with the layout's sidebar-aware margin selectors.
- **Header Actions**: Pass buttons or triggers (like `Add Button`) as children to `PageHeader` to have them appear on the top-right.

## Design Principles

- **Minimal engineering:** Do the minimum required, but do it correctly.
- No premature abstractions — extract only when there are 3+ concrete uses.
- No speculative features or config flags.
- Three similar lines > one premature helper function.

## Search Patterns (Performant)

To provide a responsive search experience without overloading the database:

1.  **Client-Side Debouncing**: Use a 500ms `setTimeout` in a `useEffect` to bridge the gap between user keystrokes (`searchQuery`) and the actual filtering logic (`activeSearch`).
2.  **Server-Side Deep Search**: When filtering parent products, use `EXISTS` subqueries to also match against their children/variations. This ensures that a search for a specific variation SKU still returns its parent container if relevant.
3.  **Global Flattening**: For search-intensive tasks (like mapping), flatten hierarchies during search so that matching variations appear as primary results alongside simple products. This improves visibility and simplifies interaction.

## Lint Rules

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/auth/index.ts` | Better Auth server config |
| `src/lib/auth/client.ts` | Better Auth client hooks |
| `src/proxy.ts` | Next.js 16 Proxy — optimsitic cookie session validation |
| `src/db/schema.ts` | Drizzle schema — all tables |
| `src/data/` | Data Access Layer (DAL) — domain queries |
| `src/lib/channels/registry.ts` | Channel registry (metadata) |
| `src/lib/agents/registry.ts` | Agent registry (metadata) |
| `src/lib/utils.ts` | `cn()` class merge helper |
| `src/lib/env.ts` | Environment variable validation |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt |

## TypeScript & Typing Rules (Mandatory)

To ensure long-term maintainability and prevent CI/CD failures:

1. **NEVER use `any`**: Strictly forbidden. Use proper types or `unknown` with narrowing.
2. **Type-Safe External Data**: Cast JSONB columns to explicit interfaces or validate with Zod.
3. **DAL Purity**: Functions in `src/data/*.ts` MUST have explicit return types.
4. **Generated Types**: Prioritize types from `api/types/` (Amazon/WooCommerce) over manual interfaces.

## Scalability & Performance (Mandatory)

1. **Parallel Data Fetching**: Always use `Promise.all()` for independent DAL queries in Server Components to prevent waterfalls.
2. **N+1 Prevention**: Never perform DB queries inside loops. Use `inArray` to fetch related records in batches.
3. **Atomic Inventory Ops**: Always use `sql` expressions for quantity mutations (e.g., `quantity + delta`) to prevent race conditions.
4. **Strategic Caching**: Use React `cache()` for auth and high-frequency DAL lookups within the same request.

## AI Agent Instructions (Mandatory Reconnaissance)

To prevent hallucinations and redundant code, ALL agents MUST follow these reconnaissance steps:

1. **Directory Reconnaissance**: Run `list_dir` on target folders before creating files. If a similar file exists (e.g., `queries.ts`), integrate instead of duplicating.
2. **Logic Discovery**: Search `src/data/` for existing queries and `src/lib/validations/` for existing schemas before writing new ones.
3. **Audit Gate**: Before declaring a task "Finished," you MUST invoke the `code-reviewer` specialist to check for IDOR risks and performance regressions.

