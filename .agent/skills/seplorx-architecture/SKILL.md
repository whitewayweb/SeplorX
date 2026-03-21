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
- The Edge middleware at `src/proxy.ts` handles session validation. **Never use `fetch()` to internal API routes inside `src/proxy.ts`** — it adds ~2s latency. Call `auth.api.getSession()` directly.
- All dashboard routes live inside `src/app/(dashboard)/`.

## Security — IDOR Prevention (Mandatory)

- **FormData identifiers** (ids like `channelId`, `productId`) that control which DB rows are mutated **must** pass through a Zod schema before use.
- **Service layer:** When accepting a row ID from client code, add an ownership constraint: `where(eq(table.id, rowId), eq(table.userId, userId))`. Not just `where(eq(table.id, rowId))`.
- **Page layer:** Server component pages must call `getAuthenticatedUserId()` and use user-scoped queries (e.g. `getChannelForUser(userId, channelId)`). Return `notFound()` for both missing and unauthorized — never leak row existence.

## Database Queries

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

- **Batched processing:** Process large API results (e.g. Amazon reports) in batches of 100 items.
- **Safe upserts:** Use `COALESCE(NULLIF(EXCLUDED.col, ''), table.col)` in `onConflictDoUpdate` to prevent overwriting with empty strings during partial syncs.
- **Module-level caching:** Initialise once at module scope (`let cache: T | null = null`) and guard with `if (!cache)`. Expose a `refresh*()` escape-hatch for dev hot-reload.

## Design Principles

- **Minimal engineering:** Do the minimum required, but do it correctly.
- No premature abstractions — extract only when there are 3+ concrete uses.
- No speculative features or config flags.
- Three similar lines > one premature helper function.

## Lint Rules

- React 19: no `setState` inside `useEffect`, no ref access during render.
- Never prefix variables with `_` to bypass ESLint — remove unused variables entirely.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/auth/index.ts` | Better Auth server config |
| `src/lib/auth/client.ts` | Better Auth client hooks |
| `src/proxy.ts` | Edge middleware — session validation |
| `src/db/schema.ts` | Drizzle schema — all tables |
| `src/lib/utils.ts` | `cn()` class merge helper |
| `src/lib/env.ts` | Environment variable validation |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt |
