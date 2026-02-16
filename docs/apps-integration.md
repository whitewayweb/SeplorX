# Apps Integration Design

## Purpose

The Apps system lets users install and configure third-party service integrations (shipping carriers, payment gateways, SMS providers, etc.) from a central marketplace-style page.

## Registry Pattern

### How It Works

App definitions live in TypeScript, not the database. The database only stores what a user has installed and their configuration values.

```
┌─────────────────────┐     ┌──────────────────────┐
│   App Registry      │     │    Database           │
│   (TypeScript)      │     │    (PostgreSQL)       │
│                     │     │                       │
│ • App ID            │     │ • Installation ID     │
│ • Name, description │     │ • User ID             │
│ • Category          │     │ • App ID (FK to reg.) │
│ • Icon              │     │ • Status              │
│ • Config fields     │     │ • Config (JSONB)      │
│   (what to ask)     │     │   (what user entered) │
└─────────────────────┘     └──────────────────────┘
```

### Why Registry Pattern?

- **No DB migrations** when adding apps — just add a TypeScript object
- **Type safety** — config field definitions are typed
- **Validation stays in sync** — Zod schemas are generated from the registry
- **Single source of truth** — no risk of DB/code drift

## Type Definitions

```typescript
// src/lib/apps/types.ts

type AppCategory = "logistics" | "payment" | "sms" | "email";

interface AppConfigField {
  key: string;           // stored in JSONB, e.g. "apiKey"
  label: string;         // form label, e.g. "API Key"
  type: "text" | "password" | "url";
  placeholder?: string;
  required: boolean;
}

interface AppDefinition {
  id: string;            // unique slug, e.g. "shree-maruti"
  name: string;          // display name
  description: string;
  category: AppCategory;
  icon: string;          // Lucide icon name
  configFields: AppConfigField[];
}

type AppStatus = "not_installed" | "installed" | "configured";

interface AppWithStatus extends AppDefinition {
  status: AppStatus;
  installationId?: number;
}
```

## Adding a New App

Add one entry to `src/lib/apps/registry.ts`:

```typescript
{
  id: "razorpay",
  name: "Razorpay",
  description: "Payment gateway for Indian businesses.",
  category: "payment",
  icon: "credit-card",
  configFields: [
    { key: "keyId", label: "Key ID", type: "text", required: true },
    { key: "keySecret", label: "Key Secret", type: "password", required: true },
  ],
}
```

That's it. The UI, validation, and DB storage all work automatically.

## Adding a New Category

1. Add to the `AppCategory` union type in `src/lib/apps/types.ts`
2. Add a label in `categoryLabels` in `src/lib/apps/registry.ts`

The tabs component reads categories dynamically from the registry.

## Current Apps

| App | Category | Config Fields |
|-----|----------|--------------|
| Shree Maruti | logistics | apiKey, accountId |
| Delhivery | logistics | apiToken, clientName, warehouseCode (optional) |
| DHL | logistics | apiKey, siteId, password, accountNumber |
| FedEx | logistics | clientId, clientSecret, accountNumber |

## Installation Flow

```
User clicks "Install"
  → installApp server action
  → INSERT into app_installations (status: "installed", config: {})
  → revalidatePath("/apps")

User fills config form and clicks "Save"
  → configureApp server action
  → Dynamic Zod validation from registry configFields
  → UPDATE app_installations (config: {...}, status: "configured")
  → revalidatePath("/apps")

User clicks "Uninstall"
  → uninstallApp server action
  → DELETE from app_installations
  → revalidatePath("/apps")
```

## Status Logic

| Condition | Status |
|-----------|--------|
| No row in `app_installations` | `not_installed` |
| Row exists, not all required fields filled | `installed` |
| Row exists, all required fields filled | `configured` |

The `configured` status is determined by checking the app's required `configFields` against the stored config JSONB.

## Dynamic Validation

Each app's Zod schema is built at runtime from its `configFields`:

```typescript
function buildAppConfigSchema(appId: string) {
  const app = getAppById(appId);
  const shape = {};
  for (const field of app.configFields) {
    shape[field.key] = field.required
      ? z.string().min(1, `${field.label} is required`)
      : z.string().optional();
  }
  return z.object(shape);
}
```

## UI Components

| Component | Purpose |
|-----------|---------|
| `category-tabs.tsx` | Tabs for switching between app categories |
| `app-grid.tsx` | Responsive grid layout for app cards |
| `app-card.tsx` | Individual app card with icon, name, status, action |
| `app-config-dialog.tsx` | Dialog with dynamic form for configuration |
| `app-status-badge.tsx` | Badge showing installation status |
| `app-icon.tsx` | Dynamic Lucide icon from string name |

## Security Notes

- API keys are stored as plain text in JSONB for now
- When auth is re-added, installations will be scoped per-user via `userId`
- Currently `userId` is hardcoded to `1`
- Future: encrypt sensitive config fields at rest
