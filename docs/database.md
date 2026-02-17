# Database Design

## Provider

Supabase PostgreSQL with two connection modes:
- **Port 6543** (transaction pooler via PgBouncer) — app runtime and local dev
- **Port 5432** (direct connection) — migrations only (`yarn db:migrate`)

## Connection

Single `postgres-js` connection cached in module scope (`globalForDb` pattern) to prevent leaks during Next.js hot reload. Max 1 connection per serverless instance — PgBouncer handles pooling.

File: `src/db/index.ts`

## Tables

### users

Existing table for user accounts.

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| name | varchar(255) | nullable |
| email | varchar(255) | NOT NULL, UNIQUE |
| password | varchar(255) | nullable |
| role | enum("admin","customer","vendor") | NOT NULL, default "customer" |
| created_at | timestamp | default now() |

### app_installations

Stores which apps a user has installed and their configuration.

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| user_id | integer | NOT NULL, FK → users.id (CASCADE) |
| app_id | varchar(100) | NOT NULL (matches registry key) |
| status | enum("installed","configured") | NOT NULL, default "installed" |
| config | jsonb | default {} |
| installed_at | timestamp | default now() |
| updated_at | timestamp | default now() |

**Unique index**: `(user_id, app_id)` — one installation per user per app.

**Note**: `app_id` references the TypeScript registry, not another DB table. The registry is the source of truth for app definitions.

## JSONB Config Column

The `config` column stores a flat `Record<string, string>`. Sensitive fields (where `type === "password"` in the app registry) are encrypted with AES-256-GCM before storage:

```json
{
  "apiKey": "a1b2c3d4...:e5f6a7b8...:9c0d1e2f...",
  "accountId": "ACC-12345"
}
```

Encrypted values use the format `iv:authTag:ciphertext` (all hex-encoded). Non-sensitive fields are stored as plain text.

The app registry defines which keys are valid. Zod validates dynamically before writes. See `src/lib/crypto.ts` for encrypt/decrypt utilities.

### companies

Business entities (suppliers, customers, or both). See `docs/business-modules.md` for full design rationale.

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| name | varchar(255) | NOT NULL |
| type | company_type enum | NOT NULL, default "supplier" |
| contact_person | varchar(255) | nullable |
| email | varchar(255) | nullable |
| phone | varchar(50) | nullable |
| gst_number | varchar(50) | nullable |
| address | text | nullable |
| city | varchar(100) | nullable |
| state | varchar(100) | nullable |
| pincode | varchar(20) | nullable |
| notes | text | nullable |
| user_id | integer | FK → users.id (SET NULL) |
| is_active | boolean | NOT NULL, default true |
| created_at | timestamp | default now() |
| updated_at | timestamp | default now() |

### products

Product catalog with cached stock levels.

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| name | varchar(255) | NOT NULL |
| sku | varchar(100) | UNIQUE |
| description | text | nullable |
| category | varchar(100) | nullable |
| unit | varchar(50) | NOT NULL, default "pcs" |
| purchase_price | decimal(12,2) | nullable |
| selling_price | decimal(12,2) | nullable |
| reorder_level | integer | NOT NULL, default 0 |
| quantity_on_hand | integer | NOT NULL, default 0 |
| is_active | boolean | NOT NULL, default true |
| created_at | timestamp | default now() |
| updated_at | timestamp | default now() |

### purchase_invoices

Bills from supplier companies. Status auto-updates based on payments.

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| invoice_number | varchar(100) | NOT NULL |
| company_id | integer | NOT NULL, FK → companies.id |
| invoice_date | date | NOT NULL |
| due_date | date | nullable |
| status | purchase_invoice_status enum | NOT NULL, default "received" |
| subtotal | decimal(12,2) | NOT NULL, default 0 |
| tax_amount | decimal(12,2) | NOT NULL, default 0 |
| discount_amount | decimal(12,2) | NOT NULL, default 0 |
| total_amount | decimal(12,2) | NOT NULL, default 0 |
| amount_paid | decimal(12,2) | NOT NULL, default 0 |
| notes | text | nullable |
| file_url | varchar(500) | nullable (uploaded invoice) |
| created_by | integer | NOT NULL, FK → users.id |
| created_at | timestamp | default now() |
| updated_at | timestamp | default now() |

**Indexes**: `(company_id)`, `(status)`

### purchase_invoice_items

Line items on purchase invoices.

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| invoice_id | integer | NOT NULL, FK → purchase_invoices.id (CASCADE) |
| product_id | integer | FK → products.id (SET NULL), nullable |
| description | varchar(500) | NOT NULL |
| quantity | decimal(12,2) | NOT NULL |
| unit_price | decimal(12,2) | NOT NULL |
| tax_percent | decimal(5,2) | NOT NULL, default 0 |
| tax_amount | decimal(12,2) | NOT NULL, default 0 |
| total_amount | decimal(12,2) | NOT NULL |
| sort_order | integer | NOT NULL, default 0 |

**Index**: `(invoice_id)`

### payments

Payments recorded against purchase invoices. Supports partial payments.

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| invoice_id | integer | NOT NULL, FK → purchase_invoices.id |
| amount | decimal(12,2) | NOT NULL |
| payment_date | date | NOT NULL |
| payment_mode | payment_mode enum | NOT NULL, default "bank_transfer" |
| reference | varchar(255) | nullable |
| notes | text | nullable |
| created_by | integer | NOT NULL, FK → users.id |
| created_at | timestamp | default now() |

**Index**: `(invoice_id)`

### inventory_transactions

Audit log for stock movements.

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| product_id | integer | NOT NULL, FK → products.id |
| type | inventory_transaction_type enum | NOT NULL |
| quantity | integer | NOT NULL (positive=in, negative=out) |
| reference_type | varchar(50) | nullable ("purchase_invoice", "manual") |
| reference_id | integer | nullable (FK to source) |
| notes | text | nullable |
| created_by | integer | NOT NULL, FK → users.id |
| created_at | timestamp | default now() |

**Indexes**: `(product_id)`, `(reference_type, reference_id)`

## Enums

| Enum | Values | Used By |
|------|--------|---------|
| role | admin, customer, vendor | users.role |
| app_status | installed, configured | app_installations.status |
| company_type | supplier, customer, both | companies.type |
| purchase_invoice_status | draft, received, partial, paid, cancelled | purchase_invoices.status |
| payment_mode | cash, bank_transfer, upi, cheque, other | payments.payment_mode |
| inventory_transaction_type | purchase_in, sale_out, adjustment, return | inventory_transactions.type |

## Conventions

- Use Drizzle ORM for all queries (`db` export from `@/db`)
- Schema types from `@/db/schema`
- Run `yarn db` (generate + migrate) after schema changes
- Always use the transaction pooler URL (port 6543) in the app
- Direct connection (port 5432) only for `yarn db:migrate`

## Migrations

Stored in `drizzle/` directory. Generated by `drizzle-kit generate`, applied by `drizzle-kit migrate`. PostgreSQL dialect.
