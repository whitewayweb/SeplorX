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
│   ├── apps/               # Apps integration page
│   │   ├── page.tsx         # Server component (dynamic, reads DB)
│   │   ├── actions.ts       # Server actions (install/configure/uninstall)
│   │   └── loading.tsx      # Skeleton loading state
│   ├── api/health/          # Health check endpoint
│   ├── page.tsx             # Dashboard
│   ├── layout.tsx           # Root layout with sidebar
│   └── error.tsx            # Global error boundary
├── components/
│   ├── apps/                # App integration components
│   ├── layout/              # Layout components (sidebar)
│   └── ui/                  # shadcn/ui primitives
├── db/
│   ├── schema.ts            # Drizzle schema (users, appInstallations)
│   └── index.ts             # DB connection (globalForDb pattern)
├── hooks/                   # React hooks (use-mobile)
└── lib/
    ├── apps/                # App registry system
    │   ├── types.ts         # Type definitions
    │   ├── registry.ts      # App definitions + helpers
    │   └── index.ts         # Barrel export
    ├── validations/apps.ts  # Zod schemas for app config
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

- Tables: `users`, `app_installations` (with JSONB `config` column)
- Migrations in `drizzle/` directory (PostgreSQL dialect)
- Use **port 6543** (transaction pooler) for the app, **port 5432** (direct) for migrations

## Conventions

- Use Yarn for all package operations
- Drizzle queries use `db` from `@/db`, schema types from `@/db/schema`
- UI components follow shadcn/ui patterns with `cn()` from `@/lib/utils`
- shadcn/ui files in `src/components/ui/` are ignored by knip (standard exports)

## Design Docs

Read these before working on related features:

- `docs/architecture.md` — system architecture, layout, data flow patterns
- `docs/apps-integration.md` — apps registry pattern, how to add new apps/categories
- `docs/database.md` — all tables, JSONB config design, connection conventions
