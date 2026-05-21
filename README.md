# SeplorX

Next.js 16 web application with Supabase PostgreSQL and Vercel deployment.

## Tech Stack

- Next.js 16 (App Router) / React 19 / TypeScript
- Supabase (PostgreSQL) via Drizzle ORM
- Tailwind CSS v4 / shadcn/ui

## Setup

```bash
# Install dependencies (yarn only)
yarn install

# Copy environment file and fill in your values
cp env.example .env.local

# Run database migrations (requires direct connection URL, port 5432)
yarn db

# Start dev server
yarn dev
```

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | Supabase PostgreSQL connection string | `postgresql://...:6543/postgres` |
| `ENCRYPTION_KEY` | Yes | 64-char hex string (32 bytes) for AES-256-GCM local encryption | `0001020304050607...` |
| `BETTER_AUTH_SECRET` | Yes | Secret for Better Auth sessions | `your-secret-here` |
| `BETTER_AUTH_URL` | Yes | App base URL | `http://localhost:3000` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | API Key for Gemini (Expense OCR / Agents) | `your-gemini-api-key` |
| `AWS_KMS_KEY_ID` | No | AWS KMS Key ID for SP-API Compliance | `arn:aws:kms...` |

Supabase provides two connection URLs:
- **Port 6543** (transaction pooler) — use for the app and local dev
- **Port 5432** (direct connection) — use for `yarn db:migrate`

## Scripts

<!-- AUTO-GENERATED -->
| Command | Description |
|---------|-------------|
| `yarn dev` | Start development server |
| `yarn build` | Production build |
| `yarn start` | Start production server |
| `yarn lint` | Run ESLint |
| `yarn knip` | Find unused code and dependencies |
| `yarn fix` | Run lint, knip, tests, and build |
| `yarn test` | Run test suite |
| `yarn test:coverage` | Run tests with coverage report |
| `yarn generate:types` | Regenerate channel API types (Amazon, WooCommerce) |
| `yarn db` | Generate and run database migrations |
| `yarn db:studio` | Open Drizzle Studio (database GUI) |
<!-- AUTO-GENERATED -->

## Channel Finance Reconciliation

Order finance data is normalized through the shared `src/lib/order-finance` service. Channel handlers can opt in with `capabilities.canSyncOrderFinances` and implement `syncOrderFinances()`.

- Amazon fetches delayed realized finance transactions from Finances API `2024-06-19`.
- WooCommerce derives finance rows from the stored order payload; it does not call a separate finance API.
- Reporting only applies cost-side finance roles to profit: marketplace fees, payment fees, withholding, adjustments, and provider-specific other costs.

## Deployment

1. Create a [Supabase](https://supabase.com/dashboard) project
2. Run migrations against it: `yarn db`
3. Connect your repo to [Vercel](https://vercel.com)
4. Set `DATABASE_URL` in Vercel dashboard
5. Deploy

Health check: `GET /api/health` returns database status.
