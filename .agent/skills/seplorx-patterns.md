---
name: seplorx-patterns
description: Coding patterns extracted from the SeplorX repository
version: 1.0.0
source: local-git-analysis
analyzed_commits: 200
---

# SeplorX Patterns

## Commit Conventions

This project generally follows a relaxed conversational convention along with prefixed topical categorizations for major subsystems:
- `Feature: ...` - For new features
- `Hotfix: ...` - For critical rapid fixes
- `[Subsystem]: ...` - Common prefixes for integrations (e.g., `Amazon:`, `Woo:`)
- Most commits end with a GitHub PR number, e.g. `(#12)`
- Use imperative mood natively (e.g., "Add bulk product sync UI")

## Code Architecture

The codebase relies on **Next.js App Router** with a highly structured domain/atomic separation:

```
src/
├── app/                  # Next.js App Router endpoints and pages
├── components/           # UI Components (Atomic Design pattern)
│   ├── atoms/            # Basic UI elements (e.g. sync-product-button)
│   ├── organisms/        # Complex, domain-specific UI (e.g. channel-products-table)
│   ├── layout/           # Global layouts and navigations
│   └── ui/               # Generic Shadcn primitives
├── db/                   # Drizzle ORM definitions
│   ├── schema.ts         # Database table schema
│   └── index.ts          # DB connection and exports
└── lib/                  # Core Business Logic
    └── channels/         # External integrations abstractions
        ├── amazon/       # SP-API definitions
        ├── woocommerce/  # Woo-specific APIs
        ├── types.ts      # Shared integration types
        └── services.ts   # Core service actions
```

## Workflows

### Database Migration
The ORM utilized is Drizzle. Based on project configurations, standard workflows include:
1. Define schema changes in `src/db/schema.ts`.
2. Generate migrations using `yarn db:generate`.
3. Apply migrations using `yarn db:migrate`.

### Component Integration
- UI elements lean heavily toward `shadcn/ui` functional blocks in `src/components/ui/`.
- Domain-specific logic is pushed to `src/components/organisms` to encapsulate complexity from the `.tsx` page files.

### Tooling Maintenance
- The project actively tracks unused files/exports via `knip` (configured in `knip.json`), so ensure proper exported variables are utilized or removed.
- Employs `yarn` exclusively as the package manager and dependency locker (`yarn.lock`).

## Testing Patterns

- **Framework**: Fully integrated with Vitest.
- **Coverage**: Handled by `@vitest/coverage-v8`, executable via `yarn test:coverage`.
- Use standard PR-blocking CI configurations (which gate PRs on passing tests and linting constraints). Tests should mock out external services like `src/lib/channels/amazon/api/client.ts`.
