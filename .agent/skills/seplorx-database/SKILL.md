---
name: seplorx-database
description: >
  SeplorX database schema, Drizzle ORM query patterns, and safe mutation conventions.
  Use when writing database queries, adding migrations, working with JSONB columns,
  defining new tables, or needing to understand the data model for products, orders,
  channels, inventory, agents, or any other module.
metadata:
  author: SeplorX
  version: "1.0"
---

# SeplorX Database

## Connection

| Purpose | URL env var | Port |
|---------|-------------|------|
| App queries (pooled) | `POSTGRES_URL` | **6543** (PgBouncer transaction pooler) |
| Migrations (direct) | `POSTGRES_URL_NON_POOLING` | **5432** (direct connection) |

DB instance: `db` from `@/db`. Config: **`max: 10`** concurrent connections to support parallel dashboard queries.

**Session Caching:** `getAuthenticatedSession` in `src/lib/auth/index.ts` is wrapped in React's `cache()`. This is critical because `max: 10` is still limited; memoizing the auth session prevents exhausting the pool with redundant auth checks on the same page.

**Never point migrations at port 6543 — migrations need a direct connection.**

## All Tables

| Table | Key Columns |
|-------|-------------|
| `users` | id, email, name, created_at |
| `sessions` | id, userId, token, expiresAt |
| `app_installations` | id, userId, appId, status, config (JSONB encrypted) |
| `channels` | id, userId, type, name, credentials (JSONB encrypted), webhookSecret |
| `channel_products` | id, channelId, externalId, name, sku, stockQuantity, rawData (JSONB) |
| `channel_product_mappings` | id, channelId, channelProductId, seplorxProductId |
| `channel_product_changelog` | id, mappingId, field, oldValue, newValue, changedAt |
| `companies` | id, userId, name, type (supplier/customer/both), email, phone |
| `products` | id, userId, name, sku, description, reorderLevel, stockQuantity |
| `purchase_invoices` | id, userId, supplierId, status, totalAmount (Decimal 12,2) |
| `purchase_invoice_items` | id, invoiceId, productId, quantity, unitPrice (Decimal 12,2) |
| `payments` | id, userId, invoiceId, amount (Decimal 12,2), paidAt |
| `inventory_transactions` | id, userId, productId, quantity (±), type, referenceId |
| `agent_actions` | id, userId, agentType, status, plan (JSONB), rationale, toolCalls (JSONB), resolvedBy |
| `settings` | id, userId, key, value |

## Migrations

```bash
yarn db:generate   # Generate new migration from schema changes
yarn db:migrate    # Apply migrations (uses POSTGRES_URL_NON_POOLING port 5432)
yarn db            # Generate + migrate in one step
yarn db:studio     # Open Drizzle Studio GUI to inspect data
```

Migrations run automatically via GitHub Actions on every push to `main`. Vercel auto-deploys in parallel — schema is up to date by the time deployment goes live.

## Rules for New Tables

1. **RLS enabled on every table** — always chain `.enableRLS()`:
   ```typescript
   export const myTable = pgTable("my_table", { ... }).enableRLS();
   ```
2. **Money columns:** `decimal("amount", { precision: 12, scale: 2 })` — never `float` or `integer`
3. **Quantities (stock):** `integer` columns
4. **Timestamps:** `timestamp("created_at").defaultNow().notNull()`

## Safe Query Patterns

### Always select explicit columns
```typescript
// ✅ Good
db.select({ id: products.id, name: products.name }).from(products)

// ❌ Bad
db.select().from(products)  // fetches all columns incl. large JSONB blobs
```

### JSONB column access — extract only what you need
```typescript
// ✅ Good — extract single field
db.select({
  apiKey: sql<string>`${appInstallations.config}->>'apiKey'`,
}).from(appInstallations)

// ❌ Bad — fetches entire blob
db.select({ config: appInstallations.config }).from(appInstallations)
```

### Scalable JSONB filtering for channel products
Standard fields (`name`, `sku`, `stockQuantity`) are native top-level columns — query directly:
```typescript
where(eq(channelProducts.sku, "ABC123"))
```

For channel-specific JSONB fields (brand, category, price), delegate to `handler.extractSqlField(fieldName)` — the logic lives in `src/lib/channels/{channel_id}/queries.ts`.

### Atomic updates (avoid read-then-write)
```typescript
// ✅ Good — atomic increment
db.update(products).set({
  stockQuantity: sql`${products.stockQuantity} + ${delta}`,
})

// ❌ Bad — race condition
const current = await db.select(...);
await db.update(...).set({ stockQuantity: current.stockQuantity + delta });
```

### Safe upserts (prevent overwriting with empty strings)
```typescript
db.insert(channelProducts).values(data).onConflictDoUpdate({
  target: channelProducts.externalId,
  set: {
    name: sql`COALESCE(NULLIF(EXCLUDED.name, ''), ${channelProducts.name})`,
    sku: sql`COALESCE(NULLIF(EXCLUDED.sku, ''), ${channelProducts.sku})`,
  },
});
```

### Multi-step mutations — always use transactions
```typescript
await db.transaction(async (tx) => {
  await tx.insert(purchaseInvoices).values(invoice);
  await tx.insert(purchaseInvoiceItems).values(items);
  // If either fails, both are rolled back
});
```

### Always scope queries by userId (IDOR prevention)
```typescript
// ✅ Good
where(and(eq(products.id, productId), eq(products.userId, userId)))

// ❌ Bad — anyone could mutate another user's data
where(eq(products.id, productId))
```

### DB error codes → user-friendly messages
```typescript
catch (err) {
  if (err instanceof Error && "code" in err) {
    if (err.code === "23505") return { error: "This item already exists." };
    if (err.code === "23503") return { error: "Referenced record not found." };
  }
  throw err;
}
```

## Batched Processing

For large external API results (e.g. Amazon reports, bulk channel product syncs):
```typescript
const BATCH_SIZE = 100;
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE);
  await db.insert(channelProducts).values(batch).onConflictDoUpdate(...);
}
```

## agent_actions Status Flow

```
pending_approval → approved → executed
                → dismissed
                → failed (set on agent error)
```
