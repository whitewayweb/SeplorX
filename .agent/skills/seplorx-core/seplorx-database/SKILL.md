### 4. Inventory Ledger & Aggregation (MANDATORY)
To prevent database bloat and ensure high-performance stock tracking:
- **Write-side Aggregation**: Always aggregate quantities by `productId` before performing bulk database writes/updates.
- **Atomic Updates**: Always use SQL expressions (e.g., `sql`${products.quantityOnHand} + delta``) rather than calculating values in Javascript to prevent race conditions.
- **Delta-Logic**: When editing existing transactions (Invoices/Orders), calculate the "Delta" (New - Old) and only update the difference. Never reverse and re-add, as it creates ledger noise.
- **Auto-Sync Trigger**: Every stock mutation MUST call `triggerChannelSync(productId)` to ensure external sales channels (Amazon/WooCommerce) stay updated.
- **Audit Consistency**: Never delete inventory transactions for reversed events (like deleted invoices). Instead, append an "Adjustment" row to maintain a perfect audit trail.

### 5. Agent Autonomy & Pilot Protocol (MANDATORY)
To minimize "Pilot Load" for the user, all agents MUST:
- **Environment Setup**: Immediately run `source .agent/env.sh` at the start of every session to ensure `yarn` and `node` are in the PATH.
- **Lead, Don't Follow**: Proactively identify and fix architecture gaps (e.g., missing syncs, race conditions) instead of waiting for a bug report.
- **Verify, Don't Assume**: Always perform a manual syntax and type audit of modified code. Always run `yarn lint --fix && yarn build` before declaring a task finished.
- **Explain 'Why', Not 'What'**: Focus summaries on the business value and architectural hardening, not a line-by-line code log.
- **Decisiveness**: Proceed through the roadmap autonomously. Only stop for definitive permission on destructive data migrations or major branding changes.

### 6. Query Optimization (Mandatory)
- **Explicit Selection**: Never use `db.select()` without a column mapping. Always use `db.select({ id: table.id, ... })` to reduce data transfer.
- **Efficient Joins**: Use `leftJoin` and `innerJoin` judiciously. Always ensure joining columns are indexed in `schema.ts`.
- **JSONB Narrowing**: Only extract the specific JSONB fields you need using `sql<T>` snippets. Never fetch the entire blob if you only need one flag.

### 7. IDOR & Ownership Audit (Critical)
Every Data Access (DAL) function and Server Action MUST pass the Ownership Audit:
- **Rule**: Every query that takes a record ID MUST also include a `userId` or `companyId` constraint derived from the current session.
- **Exception**: Public records (if any) must be explicitly marked with `// Public Access` in the code.
- **Service Layer Guard**: If a function fetches a record by ID, it must return `null` or throw unauthorized if the owner check fails. Never return a record first and check ownership after.

```typescript
// ✅ Good: One-step atomic ownership check
const record = await db.query.products.findFirst({
  where: (t, { and, eq }) => and(eq(t.id, id), eq(t.userId, currentUserId))
});
if (!record) throw new Error("Unauthorized or Not Found");
```
