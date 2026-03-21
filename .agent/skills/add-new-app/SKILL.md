---
name: add-new-app
description: >
  How to add a new third-party app or service integration to SeplorX's app registry.
  Use when integrating a new shipping carrier, payment gateway, accounting tool, SMS provider,
  or any other external service. Covers AppDefinition, configFields, category, icon,
  config encryption, and installation flow. No DB migration needed.
metadata:
  author: SeplorX
  version: "1.0"
---

# Adding a New App to SeplorX

## How the App Registry Works

App definitions live in TypeScript — **not the database**. The database only stores what a user has installed and their encrypted config values.

```
App Registry (TypeScript)     Database (PostgreSQL)
─────────────────────────     ─────────────────────
• App ID + slug               • Installation ID
• Name, description           • User ID
• Category                    • App ID (foreign key to registry)
• Icon (Lucide name)          • Status (installed | configured)
• Config field definitions    • Config JSONB (encrypted values)
```

**Benefit:** Adding a new app requires zero DB migrations — just a TypeScript object.

## Adding a New App

Add one entry to `src/lib/apps/registry.ts`:

```typescript
{
  id: "dhl-express",        // unique slug — kebab-case
  name: "DHL Express",
  description: "International express shipping via DHL.",
  category: "logistics",    // "logistics" | "payment" | "sms" | "email"
  icon: "plane",             // any Lucide icon name (string)
  configFields: [
    { key: "apiKey",         label: "API Key",         type: "text",     required: true },
    { key: "accountNumber",  label: "Account Number",  type: "text",     required: true },
    { key: "password",       label: "Password",        type: "password", required: true },
    { key: "warehouseCode",  label: "Warehouse Code",  type: "text",     required: false },
  ],
}
```

That's the only change needed. The UI, validation, and DB storage all work automatically.

## Config Field Types

| type | Behaviour |
|------|-----------|
| `"text"` | Plain text input, stored as-is in JSONB |
| `"url"` | URL input, stored as-is in JSONB |
| `"password"` | Encrypted at rest using AES-256-GCM before storing; **never sent to client** — displayed as `••••••••` |

**Encryption:** `src/lib/crypto.ts` — `encrypt()` / `decrypt()` / `isEncrypted()`. The `configureApp` action encrypts `password`-type fields before storing. The page redacts them before rendering.

## Adding a New Category

If none of the existing categories fit (`logistics` | `payment` | `sms` | `email`):

1. Add to the `AppCategory` union type in `src/lib/apps/types.ts`
2. Add a label in `categoryLabels` in `src/lib/apps/registry.ts`

The tabs component reads categories dynamically from the registry — no UI changes needed.

## Installation Flow (Automatic)

```
User clicks "Install"
  → installApp server action
  → INSERT app_installations (status: "installed", config: {})

User fills config form and clicks "Save"
  → configureApp server action
  → Zod schema built dynamically from registry configFields
  → Password-type fields encrypted via crypto.ts
  → UPDATE app_installations (config: {...}, status: "configured")

User clicks "Uninstall"
  → uninstallApp server action
  → DELETE app_installations row
```

## Status Logic

| Condition | Status |
|-----------|--------|
| No row in `app_installations` | `not_installed` |
| Row exists, missing required fields | `installed` |
| Row exists, all required fields filled | `configured` |

## Dynamic Validation (Automatic)

Each app's Zod schema is built at runtime from its `configFields`. Don't write manual schemas — the existing `buildAppConfigSchema(appId)` utility handles it.

## Current Apps

| App | Category | Config Fields |
|-----|----------|---------------|
| Shree Maruti | logistics | apiKey, accountId |
| Delhivery | logistics | apiToken, clientName, warehouseCode (optional) |
| DHL | logistics | apiKey, siteId, password, accountNumber |
| FedEx | logistics | clientId, clientSecret, accountNumber |

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/apps/registry.ts` | **Edit here** — add new app entry |
| `src/lib/apps/types.ts` | `AppDefinition`, `AppConfigField`, `AppCategory` types |
| `src/app/apps/actions.ts` | `installApp`, `configureApp`, `uninstallApp` server actions |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt for password fields |
| `src/app/apps/page.tsx` | Marketplace UI — reads registry + installation status |

## Environment Variable Required

| Variable | Purpose |
|----------|---------|
| `ENCRYPTION_KEY` | 64-character hex string (32 bytes) for AES-256-GCM encryption of password fields |
