# CLAUDE.md

## Project

SeplorX — Next.js 16 web app with authentication, deployed on Vercel with Supabase PostgreSQL.

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict)
- **Database:** Supabase PostgreSQL via Drizzle ORM + postgres-js
- **Auth:** Auth.js v5 (NextAuth beta) with Credentials provider, bcryptjs
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
yarn create:admin     # Interactive admin user creation
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/auth/           # NextAuth route handler
│   ├── api/health/         # Health check endpoint
│   ├── actions/auth.ts     # Server actions (login, logout)
│   ├── login/              # Login page
│   ├── page.tsx            # Home (protected)
│   └── error.tsx           # Global error boundary
├── auth.ts                 # NextAuth config with Credentials provider
├── auth.config.ts          # Auth callbacks (jwt, session, authorized)
├── proxy.ts                # Middleware (auth protection via matcher)
├── components/
│   ├── auth/               # Auth-specific components
│   └── ui/                 # shadcn/ui components (button, card, input, label)
├── db/
│   ├── schema.ts           # Drizzle schema (pgTable, pgEnum)
│   └── index.ts            # DB connection (postgres-js, globalForDb pattern)
├── lib/
│   ├── env.ts              # Environment variable validation
│   ├── utils.ts            # cn() class merge helper
│   └── validations/auth.ts # Zod schemas (LoginSchema)
└── types/next-auth.d.ts    # Session/JWT type augmentation (role field)
scripts/
└── create-admin.ts         # CLI script to create admin users
```

## Key Patterns

- **Path alias:** `@/*` maps to `./src/*`
- **DB connection:** Uses `globalForDb` pattern to prevent connection leaks during dev hot reload. `max: 1` connection per serverless instance — Supabase PgBouncer (port 6543) handles pooling.
- **Auth flow:** Middleware in `proxy.ts` protects all routes except `/login`, `/register`, `/api/*`, and static assets. Auth callbacks inject `role` into JWT and session.
- **Roles:** `"admin" | "customer"` — defined as `pgEnum` in schema and typed in `next-auth.d.ts`
- **Server actions:** Login/logout in `src/app/actions/auth.ts` using `useActionState` on client
- **Environment:** Required vars (`DATABASE_URL`, `AUTH_SECRET`) validated at startup in `src/lib/env.ts`. Skipped during build phase. Warns in dev, throws in production.

## Database

- Single table: `users` (id, name, email, password, role, createdAt)
- Migrations in `drizzle/` directory (PostgreSQL dialect)
- Use **port 6543** (transaction pooler) for the app, **port 5432** (direct) for migrations

## Conventions

- Use Yarn for all package operations
- Drizzle queries use the `db` export from `@/db`
- Schema types from `@/db/schema`
- All form validation through Zod schemas in `src/lib/validations/`
- UI components follow shadcn/ui patterns with `cn()` from `@/lib/utils`
