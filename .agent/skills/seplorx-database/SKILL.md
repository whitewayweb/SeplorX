### 4. Inventory Ledger & Aggregation (MANDATORY)
To prevent database bloat and ensure high-performance stock tracking:
- **Write-side Aggregation**: Always aggregate quantities by `productId` before performing bulk database writes/updates.
- **Atomic Updates**: Always use SQL expressions (e.g., `sql`${products.quantityOnHand} + delta``) rather than calculating values in Javascript to prevent race conditions.
- **Delta-Logic**: When editing existing transactions (Invoices/Orders), calculate the "Delta" (New - Old) and only update the difference. Never reverse and re-add, as it creates ledger noise.
- **Auto-Sync Trigger**: Every stock mutation MUST call `triggerChannelSync(productId)` to ensure external sales channels (Amazon/WooCommerce) stay updated.
- **Audit Consistency**: Never delete inventory transactions for reversed events (like deleted invoices). Instead, append an "Adjustment" row to maintain a perfect audit trail.

### 5. Agent Autonomy & Pilot Protocol (MANDATORY)
To minimize "Pilot Load" for the user, all agents MUST:
- **Lead, Don't Follow**: Proactively identify and fix architecture gaps (e.g., missing syncs, race conditions) instead of waiting for a bug report.
- **Verify, Don't Assume**: Always perform a manual syntax and type audit of modified code. If `yarn lint` is available, run it. Never report "Verified" unless you are 100% certain of the build status.
- **Explain 'Why', Not 'What'**: Focus summaries on the business value and architectural hardening, not a line-by-line code log.
- **Decisiveness**: Proceed through the roadmap autonomously. Only stop for definitive permission on destructive data migrations or major branding changes.

### Always scope queries by userId (IDOR prevention)
```typescript
// ✅ Good
where(and(eq(products.id, productId), eq(products.userId, userId)))

// ❌ Bad — anyone could mutate another user's data
where(eq(products.id, productId))
```
