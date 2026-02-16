# SeplorX Deployment Guide

## Stack

- **Framework:** Next.js on Vercel
- **Database:** Supabase (PostgreSQL)
- **ORM:** Drizzle
- **Auth:** Auth.js v5

---

## Supabase Setup

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Go to **Settings > Database > Connection string**
3. Note two connection URLs:
   - **Transaction pooler** (port 6543) — use for Vercel and local dev
   - **Direct connection** (port 5432) — use for migrations and CLI scripts

---

## Required Environment Variables

Set these in your Vercel dashboard (Settings > Environment Variables):

### Database
```bash
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
```
Use the **Transaction pooler** URL (port 6543) for Vercel.

### Authentication
```bash
AUTH_SECRET="your-secret-here"
AUTH_URL="https://your-domain.vercel.app"
AUTH_TRUST_HOST="true"
```
Generate AUTH_SECRET:
```bash
openssl rand -base64 32
```

### Environment
```bash
NODE_ENV="production"
```

---

## Database Migrations

Migrations use the **direct connection** URL (port 5432), not the pooler.

```bash
# Temporarily set direct connection URL for migrations
export DATABASE_URL="postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Generate and run migrations
yarn db

# Create admin user
yarn create:admin
```

---

## Vercel Deployment

1. Connect your Git repository in the Vercel dashboard
2. Set all environment variables listed above
3. Deploy — Vercel auto-detects Next.js and configures the build

No special configuration (`vercel.json`) is needed.

---

## Deployment Checklist

### Before Deploying
- [ ] Supabase project created and database accessible
- [ ] Migrations run successfully (`yarn db`)
- [ ] Admin user created (`yarn create:admin`)
- [ ] All environment variables set in Vercel dashboard
- [ ] AUTH_URL matches your production domain (no trailing slash)

### After Deploying
- [ ] Visit `/api/health` to check system status
- [ ] Test login functionality
- [ ] Check Vercel function logs for warnings

---

## Health Monitoring

Visit `https://your-domain/api/health` to check:
- Database connectivity
- Auth configuration
- Overall system health

**Healthy response (200):**
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok", "message": "Connected" },
    "auth": { "status": "ok", "message": "Configuration validated" }
  }
}
```

---

## Local Development

```bash
# Install dependencies
yarn install

# Set up environment
cp env.example .env.local
# Edit .env.local with your Supabase connection string and auth secret

# Run database migrations
yarn db

# Create admin user
yarn create:admin

# Start development server
yarn dev
```

---

## Common Issues

### 503 Service Unavailable
**Cause:** Database connection failure
**Fix:**
1. Check `/api/health` for specific errors
2. Verify DATABASE_URL is correct and uses the pooler URL (port 6543)
3. Check Supabase dashboard for database status

### CallbackRouteError
**Cause:** AUTH_URL mismatch
**Fix:**
1. Ensure AUTH_URL matches your exact domain
2. Remove trailing slashes from AUTH_URL
3. Use `https://` for production

### Connection Refused
**Cause:** Wrong connection URL or Supabase project paused
**Fix:**
1. Verify you're using the pooler URL (port 6543) for the app
2. Check if your Supabase project is active (free tier pauses after inactivity)
3. Use direct connection URL (port 5432) only for migrations

---

## Architecture

### Connection Handling
- **Supabase PgBouncer** handles server-side connection pooling (port 6543)
- **postgres-js** connects with `max: 1` per serverless function instance
- Connections are cached in module scope for dev hot-reload safety

### Security
- Environment variable validation at startup
- Bcrypt password hashing
- JWT session management with Auth.js v5
- Protected routes via middleware
