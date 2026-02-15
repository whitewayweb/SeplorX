# SeplorX Production Deployment Guide

## Required Environment Variables

Set these in your hosting provider's dashboard (Hostinger, Vercel, etc.):

### Database
```bash
DATABASE_URL="mysql://user:password@host:port/database"
```
**Important Notes:**
- URL-encode special characters in password (e.g., `|` becomes `%7C`)
- For Hostinger: Use the exact connection string from your MySQL dashboard

### Authentication
```bash
AUTH_SECRET="your-secret-here"
AUTH_URL="https://your-domain.com"
AUTH_TRUST_HOST="true"
```
**Generate AUTH_SECRET:**
```bash
openssl rand -base64 32
```

### Environment
```bash
NODE_ENV="production"
```

## Deployment Checklist

### Before Deploying
- [ ] All environment variables are set in hosting dashboard
- [ ] Database is accessible from production server
- [ ] AUTH_URL matches your production domain (no trailing slash!)
- [ ] Special characters in DATABASE_URL are URL-encoded

### After Deploying
- [ ] Visit `/api/health` to check system status
- [ ] Test login functionality
- [ ] Check server logs for any warnings

## Health Monitoring

Visit `https://your-domain.com/api/health` to check:
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

**Unhealthy response (503):** Check server logs for details

## Common Issues

### 503 Service Unavailable
**Cause:** Database connection failure or resource limits exceeded  
**Fix:** 
1. Check `/api/health` for specific errors
2. Verify DATABASE_URL is correct
3. Check database connection limits (we use max 5 connections)

### CallbackRouteError
**Cause:** AUTH_URL mismatch  
**Fix:** 
1. Ensure AUTH_URL matches your exact domain
2. Remove trailing slashes from AUTH_URL
3. Use `https://` not `http://` for production

### Database Connection Hangs
**Cause:** Connection pool exhaustion  
**Fix:** Application automatically retries with exponential backoff. If persists, restart the Node.js application.

## Architecture Features

### Resilience
- **Automatic retry** for transient connection failures (3 attempts, exponential backoff)
- **Connection pooling** optimized for shared hosting (max 5 connections)
- **Health checks** for proactive monitoring
- **Error boundaries** to prevent cascade failures

### Monitoring
- `/api/health` endpoint for status checks
- Detailed logging in development mode
- Production-safe error messages for users

### Security
- Environment variable validation at startup
- Secure password handling with bcrypt
- Session-based authentication with Auth.js v5
- Protected routes via middleware

## Local Development

```bash
# Install dependencies
yarn install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your values

# Run database migrations
yarn db

# Create admin user
yarn create:admin

# Start development server
yarn dev
```

## Troubleshooting

If you encounter issues:

1. **Check health endpoint:** `curl https://your-domain.com/api/health`
2. **Review server logs** in your hosting dashboard
3. **Verify environment variables** are set correctly
4. **Test database connection** from your hosting environment
5. **Check for special characters** in DATABASE_URL (URL-encode them!)

For persistent issues, review the application logs which include:
- ✅ Successful database connections
- ❌ Failed health checks
- ⚠️ Retry attempts
- 🔌 Connection pool events
