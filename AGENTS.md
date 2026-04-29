# Codex Project Rules

Use `.agent/` as reference material when relevant, but follow this file first.
The `.agent/` directory contains broader Claude/ECC-oriented rules, skills, and workflows; do not assume those tools or agent names exist in Codex.

## Working Style

- Read existing patterns before editing.
- Prefer current app architecture, shadcn components, data-access helpers, and server actions.
- Before creating new UI helpers, icons, services, or workflows, search for an existing equivalent and reuse or extend it.
- For channel-specific display, use the channel registry/configuration as the source of truth instead of hardcoded channel metadata.
- Treat stock sync review queues as stock reconciliation workflows: emphasize review, compare, resolve, and audit-friendly actions over bulk shortcuts.
- Keep changes scoped to the user's request.
- Avoid unrelated refactors, formatting churn, or generated-file edits.
- Prefer simple, readable implementations over clever or speculative designs.
- Add comments only when they explain non-obvious intent or constraints.

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

## Frontend Work

- Match the existing visual system and component conventions.
- Avoid generic template-looking UI.
- Make responsive states usable on mobile and desktop.
- Ensure interactive elements have clear hover, focus, disabled, and loading states when applicable.

## Testing and Verification

- Run the most relevant lint, typecheck, test, or build command before finalizing when practical.
- If a check cannot be run, explain why in the final response.
- Add or update tests when changing behavior with meaningful regression risk.
