# Codex Project Rules

Use `.agent/` as reference material when relevant, but follow this file first.
The `.agent/` directory contains broader Claude/ECC-oriented rules, skills, and workflows; do not assume those tools or agent names exist in Codex.

## Working Style

- Match existing project patterns before adding new abstractions.
- Keep changes scoped to the user's request.
- Avoid unrelated refactors, formatting churn, or generated-file edits.
- Prefer simple, readable implementations over clever or speculative designs.
- Add comments only when they explain non-obvious intent or constraints.

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

## Frontend Work

- Match the existing visual system and component conventions.
- Avoid generic template-looking UI.
- Make responsive states usable on mobile and desktop.
- Ensure interactive elements have clear hover, focus, disabled, and loading states when applicable.

## Testing and Verification

- Run the most relevant lint, typecheck, test, or build command before finalizing when practical.
- If a check cannot be run, explain why in the final response.
- Add or update tests when changing behavior with meaningful regression risk.

