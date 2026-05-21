# Codex Project Rules

Use `.agent/` as reference material when relevant, but follow this file first.
The `.agent/` directory contains broader Claude/ECC-oriented rules, skills, and workflows; do not assume those tools or agent names exist in Codex.

## Working Style

- Read existing patterns before editing.
- Prefer current app architecture, shadcn components, data-access helpers, and server actions.
- Before creating new UI helpers, icons, services, or workflows, search for an existing equivalent and reuse or extend it.
- Across the codebase, whenever work compares or resolves external, derived, cached, imported, AI-extracted, expected, or target state against SeplorX source-of-truth data, apply the local reconciliation workflow by default: compare source and target state explicitly, preselect or propose matches, require review for risky changes, and keep actions auditable.
- Across the codebase, for cleanup or maintainability requests, apply the local refactor-code workflow by default: keep edits scoped, collocate domain helpers near their owning feature, remove redundant one-off code, and preserve behavior unless a behavior change is explicitly requested.
- For channel-specific display, use the channel registry/configuration as the source of truth instead of hardcoded channel metadata.
- Treat stock sync review queues as stock reconciliation workflows: emphasize review, compare, resolve, and audit-friendly actions over bulk shortcuts.
- Keep changes scoped to the user's request.
- Avoid unrelated refactors, formatting churn, or generated-file edits.
- Prefer simple, readable implementations over clever or speculative designs.
- Add comments only when they explain non-obvious intent or constraints.

## Architecture and Refactoring

- **Incremental Architecture Refactoring**: When adding new features, use a Domain-Driven structure (`src/features/<domain>/`). Move old features into this structure incrementally as they are updated, rather than doing a "Big Bang" rewrite.
- **Skinny Server Actions**: Keep Next.js Server Actions "skinny". Offload business logic, heavy database queries, and external API interactions to a dedicated `src/services/` layer.
- **Core Action Wrappers**: Use higher-order wrappers in `src/core/` (e.g., `authenticatedAction`) for Server Actions to ensure consistent authentication and role-based access control (RBAC) checks, avoiding duplicated logic.
- **Infrastructure Decoupling**: Isolate 3rd-party API logic (Stripe, Amazon SP-API, etc.) completely within `src/lib/<service>/`. Business logic should interact with these via clean interfaces without knowing the underlying implementation details.

## Project Commands

- Use Yarn for this repository; do not use npm commands unless the user explicitly asks.
- Start the local development server with `yarn dev`.
- Use `yarn fix` for the preferred fix/verification workflow when practical.
- For targeted checks, prefer Yarn equivalents such as `yarn lint`, `yarn build`, and `yarn test`.

## Product and Data Flow

- Implement end-to-end when changing product behavior: data query, auth and ownership checks, UI state, empty/error/loading states, and verification.
- Use source-of-truth data directly.
- Avoid proxy counts or duplicated business logic when a direct query or service exists.
- For bulk or admin actions, show clear scope, confirmation, partial success/failure feedback, and refresh affected routes.

## Sales Cost and Channel Mapping

- Channel product mapping improves reporting, order attribution, and future order processing, but mapping/backfilling must not mutate inventory quantities by itself.
- Historical missing-cost reconciliation may update only sales-order item attribution fields such as `sales_order_items.product_id`, `unit_cost`, `cost_source`, and `cost_captured_at`.
- Historical mapping or cost backfills must not create stock reservations, inventory transactions, or alter `products.quantityOnHand` / `products.reservedQuantity`.
- Bundle order-item costs should be captured from component costs at order-ingestion or mapping-resolution time; do not push bundle purchase-price calculation into dashboard-only reporting.
- Inventory reconciliation remains a separate workflow. Reserve, deduct, release, restock, or discard inventory only through the order stock-processing and return workflows.
- Manual sales-cost audit resolution should be reviewable and audit-friendly: show source channel data, affected order scope, selected SeplorX target product, and clear success/failure feedback.

## Performance

- Treat performance as required from day one.
- Aggregate, filter, and paginate on the server.
- Avoid loading large child collections into initial pages.
- Fetch details on demand when the full dataset is not required immediately.

## SSR and Hydration

- Keep SSR hydration safe.
- Do not render `Date.now()`, `Math.random()`, browser-only values, or locale-dependent `toLocaleString()` output during SSR.
- Use deterministic formatting with fixed locale and timezone, or move truly client-only values behind a client boundary.

## TypeScript and JavaScript

- Use explicit types for exported functions, shared models, and component props.
- Avoid `any`; use `unknown` for external data and narrow it safely.
- Prefer named interfaces or type aliases for repeated object shapes.
- Do not leave `console.log` statements in production code.

## Security and Data Handling

- Do not hardcode secrets, credentials, tokens, or private keys.
- Validate user input, API responses, and file data at system boundaries.
- Avoid leaking sensitive details in user-facing errors.
- Use existing project validation, auth, and logging patterns when available.
- Server actions consumed by client components must return explicit typed success/error unions.
- Do not return raw exception strings, provider errors, SQL details, credentials, or stack details to the client; log details server-side and return generic user-facing messages.

## Queue and Job Workflows

- Review queues must filter, sort, count, and paginate on the server.
- Queue membership should represent actionable work only; exclude unsupported/non-actionable records or persist a clear terminal status.
- Bulk actions must require explicit user confirmation and show the affected scope before execution.
- Job creation and item creation must be transactional.
- Concurrent job processing must atomically claim work before external side effects.
- Stock quantities pushed externally must use the canonical available-stock definition: `Math.max(0, quantityOnHand - reservedQuantity)`.
- Automatic order/finance sync should be self-healing and backlog-draining. Keep claim/cursor state in shared sync helpers, let the background worker orchestrate bounded order and finance batches, and reserve manual finance controls for fallback/admin actions rather than normal table-row workflows.
- Do not hide finance reconciliation inside channel order-fetch handlers; channel handlers may expose `syncOrderFinances`, but automatic finance backlog processing should be driven by the sync worker so old eligible rows are retried without manual intervention.
- When an order sync saves orders for a finance-capable channel, dispatch bounded finance-only continuation work so newly eligible orders are reconciled by the automatic flow rather than waiting for manual buttons.

## Bundle and Inventory Logic

- **Bundle Definition**: A bundle is a virtual product composed of one or more "Simple" products.
- **Derived Stock**: Bundled product availability must always be derived dynamically from its component parts using the "weakest link" calculation: `Math.floor(componentAvailable / quantityInBundle)`.
- **Immutability**: Once a product is established as a bundle, do not allow conversion back to a simple product to preserve inventory audit trails.
- **Atomic Operations**: Updating bundle components must be handled within a database transaction, ensuring the join table (`product_bundles`) is always in sync with the parent product.
- **Hidden Derived Fields**: Do not allow manual editing of `purchasePrice` or `quantityOnHand` for bundle products; these should be treated as read-only or derived in the UI.
- **Recursive Resolution**: When processing orders or returns, always "explode" bundles into their constituent simple products for stock deduction and reconciliation.

## Frontend Work

- Match the existing visual system and component conventions.
- Avoid generic template-looking UI.
- Make responsive states usable on mobile and desktop.
- Ensure interactive elements have clear hover, focus, disabled, and loading states when applicable.

## Testing and Verification

- Run the most relevant lint, typecheck, test, or build command before finalizing when practical.
- If a check cannot be run, explain why in the final response.
- Add or update tests when changing behavior with meaningful regression risk.
