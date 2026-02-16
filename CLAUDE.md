# CLAUDE.md

## Project

SeplorX — Next.js 16 web app deployed on Vercel with Supabase PostgreSQL.

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict)
- **Database:** Supabase PostgreSQL via Drizzle ORM + postgres-js
- **Styling:** Tailwind CSS v4, shadcn/ui (New York style), Radix UI, Lucide icons
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
├── app/                    # Next.js App Router pages and API routes
│   ├── api/health/         # Health check endpoint
│   ├── page.tsx            # Home (dashboard)
│   └── error.tsx           # Global error boundary
├── components/
│   └── ui/                 # shadcn/ui components (button)
├── db/
│   ├── schema.ts           # Drizzle schema (pgTable, pgEnum)
│   └── index.ts            # DB connection (postgres-js, globalForDb pattern)
└── lib/
    ├── env.ts              # Environment variable validation
    └── utils.ts            # cn() class merge helper
```

## Key Patterns

- **Path alias:** `@/*` maps to `./src/*`
- **DB connection:** Uses `globalForDb` pattern to prevent connection leaks during dev hot reload. `max: 1` connection per serverless instance — Supabase PgBouncer (port 6543) handles pooling.
- **Environment:** Required var `DATABASE_URL` validated at startup in `src/lib/env.ts`. Skipped during build phase. Warns in dev, throws in production.

## Database

- Single table: `users` (id, name, email, password, role, createdAt)
- Migrations in `drizzle/` directory (PostgreSQL dialect)
- Use **port 6543** (transaction pooler) for the app, **port 5432** (direct) for migrations

## Conventions

- Use Yarn for all package operations
- Drizzle queries use the `db` export from `@/db`
- Schema types from `@/db/schema`
- UI components follow shadcn/ui patterns with `cn()` from `@/lib/utils`
