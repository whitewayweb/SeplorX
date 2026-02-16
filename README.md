# SeplorX

Next.js 16 web application with role-based authentication, Supabase PostgreSQL, and Vercel deployment.

## Tech Stack

- Next.js 16 (App Router) / React 19 / TypeScript
- Supabase (PostgreSQL) via Drizzle ORM
- Auth.js v5 with Credentials provider
- Tailwind CSS v4 / shadcn/ui

## Setup

```bash
# Install dependencies (yarn only)
yarn install

# Copy environment file and fill in your values
cp env.example .env.local

# Run database migrations (requires direct connection URL, port 5432)
yarn db

# Create an admin user
yarn create:admin

# Start dev server
yarn dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Supabase PostgreSQL connection string |
| `AUTH_SECRET` | Yes | NextAuth secret (`openssl rand -base64 32`) |
| `AUTH_URL` | Production | Your app URL (e.g. `https://app.example.com`) |
| `AUTH_TRUST_HOST` | Production | Set to `true` |

Supabase provides two connection URLs:
- **Port 6543** (transaction pooler) — use for the app and local dev
- **Port 5432** (direct connection) — use for `yarn db:migrate` and `yarn create:admin`

## Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Start development server |
| `yarn build` | Production build |
| `yarn lint` | Run ESLint |
| `yarn knip` | Find unused code and dependencies |
| `yarn db` | Generate and run database migrations |
| `yarn db:studio` | Open Drizzle Studio (database GUI) |
| `yarn create:admin` | Create an admin user interactively |

## Deployment

1. Create a [Supabase](https://supabase.com/dashboard) project
2. Run migrations against it: `yarn db`
3. Connect your repo to [Vercel](https://vercel.com)
4. Set environment variables in Vercel dashboard
5. Deploy

Health check: `GET /api/health` returns database and auth status.
