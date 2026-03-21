# Performance Patterns & Optimization

This document outlines mandatory performance patterns to be followed across the SeplorX codebase. Failure to follow these patterns leads to re-render loops, high latency, and inefficient resource usage.

## 1. Middleware Authentication

**Anti-Pattern:**
Using `fetch()` to an internal API route (e.g., `/api/auth/get-session`) inside `src/proxy.ts` (middleware).

**Why it fails:**
- Introduces ~2000ms latency per request in development.
- Creates a new HTTP request-response cycle on every navigation/asset load.
- Causes re-render loops if session cookies aren't updated until the internal fetch completes.

**Optimized Solution:**
Use `getSessionCookie(request)` from `better-auth/cookies` for a fast, optimistic edge check.

```typescript
// src/proxy.ts
import { getSessionCookie } from "better-auth/cookies";

export async function proxy(request: NextRequest) {
    const sessionCookie = getSessionCookie(request);
    // ... optimistic logic ...
}
```

**Note:** Delay full session validation (DB queries) to Server Components via `getAuthenticatedUserId()`. Avoid any DB work in `proxy.ts`.

## 2. Database Column Selection

**Anti-Pattern:**
`db.select().from(table)`

**Why it fails:**
Fetches massive JSONB blobs (`rawData`, `credentials`) when they aren't needed, increasing memory usage and transfer time.

**Optimized Solution:**
Always specify the required columns.

```typescript
// src/lib/products/queries.ts
const result = await db
    .select({
        id: products.id,
        name: products.name,
        sku: products.sku
    })
    .from(products);
```

## 3. Server Actions & Revalidation

**Pattern:**
Minimize `revalidatePath("/")` or global revalidations.

**Why:**
Next.js will purge the cache for *every* layout and child route, forcing full re-renders of the sidebar and headers on every mutation.

**Optimized Solution:**
Target specific paths or use `revalidateTag` for granular control.

```typescript
revalidatePath("/channels"); // Only revalidate the specific list
```

## 4. Debounced Search

**Pattern:**
Always debounce text inputs that trigger URL search parameters.

**Why:**
Prevent a cascade of `GET /page?q=...` requests while the user is typing, which causes the terminal to flood and the UI to stutter.

**Implementation:**
Use the `TableSearch` component in `src/components/ui/table-search.tsx` which handles 300ms debouncing correctly.
