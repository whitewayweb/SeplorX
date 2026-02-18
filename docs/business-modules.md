# Business Modules

## Overview

SeplorX business modules provide company management, purchase invoice tracking, inventory/stock management, and payment recording for ecommerce operations.

## Architecture

### Company as Business Entity

Companies have their own table — separate from `users`. A company represents a business entity (with GST, address, contact details) while a user represents a system login. The `type` column classifies companies as:

- **supplier** — you buy products from them
- **customer** — you sell products to them
- **both** — acts as both supplier and customer

The optional `user_id` FK on companies allows future portal access. The `role` enum on `users` includes `"vendor"` for when companies need login accounts.

### Data Flow

```
Company (supplier) → Purchase Invoice → Line Items → Products
                            ↓                          ↓
                         Payments            Inventory Transactions
                                                     ↓
                                              Stock Level (cached)
```

1. **Create company** in the companies table (type: supplier, customer, or both)
2. **Record purchase invoice** with line items referencing products
3. **Stock updates** automatically when invoice is created (inventory transactions + cached quantity)
4. **Record payments** against invoices; status auto-updates (received → partial → paid)

## Modules

### Companies (`/companies`)

CRUD for business entity management. Each company has:
- Type: supplier, customer, or both
- Business info: name, GST number
- Contact info: person, email, phone
- Address: street, city, state, pincode
- Status: active/inactive toggle
- Notes: internal notes

**Key patterns:**
- Server actions for all mutations (`src/app/companies/actions.ts`)
- Zod validation schemas (`src/lib/validations/companies.ts`)
- Cannot delete companies with existing invoices (FK constraint returns user-friendly error)

### Products (`/products`)

Product catalog with stock tracking:
- SKU (unique), name, description, category
- Purchase price, selling price (decimal 12,2)
- Unit of measurement (pcs, kg, etc.)
- Reorder level (alert threshold)
- Quantity on hand (cached, updated via inventory transactions)

**Key patterns:**
- Server actions for CRUD + stock adjustment (`src/app/products/actions.ts`)
- Zod validation schemas (`src/lib/validations/products.ts`)
- Stock adjustment atomically updates `quantity_on_hand` using `sql` template and logs an `inventory_transaction`
- Cannot delete products with existing invoices or inventory records (FK constraint)
- Duplicate SKU returns user-friendly error (unique constraint violation 23505)
- Product detail page (`/products/[id]`) shows pricing, stock levels, and transaction history
- Stock alert badges: "Out of stock" (red) when qty ≤ 0, "Low stock" (amber) when qty ≤ reorder level

### Purchase Invoices (`/invoices`)

Bills received from supplier companies:
- Invoice number, company, dates (invoice date, due date)
- Line items with optional product reference, quantity, unit price, tax %
- Auto-calculated: line tax, line total, subtotal, tax total, grand total (minus discount)
- File upload for invoice PDF (deferred — column exists, UI added later)
- Status workflow: draft → received → partial → paid | cancelled

**Key patterns:**
- Server actions for create (with line items), update (header), delete (`src/app/invoices/actions.ts`)
- Zod validation schemas (`src/lib/validations/invoices.ts`)
- Invoice creation is a single DB transaction: insert invoice → insert line items → update product stock → create inventory transactions
- Line items with `productId` reference auto-update stock on non-draft invoices (type: `purchase_in`)
- Stock updates use atomic `sql` template: `quantity_on_hand + qty`
- Unique constraint on `(company_id, invoice_number)` returns user-friendly error (23505)
- Cannot delete invoices with payments (FK constraint 23503, suggests cancellation instead)
- Invoice detail page (`/invoices/[id]`) shows header, line items with product join, payments list
- Invoice list page joins with companies table for supplier name display
- Line items sent as JSON-encoded array in FormData for create action
- Dynamic line item form with add/remove, product selection auto-fills description + purchase price

### Payments

Recorded against purchase invoices:
- Amount, date, payment mode (cash, bank transfer, UPI, cheque, other)
- Reference (cheque number, UTR, transaction ID)
- Multiple partial payments supported
- Invoice status auto-updates based on amount paid vs total

**Key patterns:**
- Server actions for add payment + delete payment (`src/app/invoices/actions.ts`)
- Payment recording is a single DB transaction: validate invoice → check for overpayment → insert payment → atomically update `amount_paid` → auto-set status
- Status auto-calculation: `paid >= total` → "paid", `paid > 0` → "partial", `paid <= 0` → "received"
- Deleting a payment reverses the amount_paid and recalculates status
- Cannot add payment to cancelled invoices
- Overpayment validation: `currentPaid + newAmount > totalAmount` returns user-friendly error
- Payment dialog pre-fills remaining balance as default amount

### Inventory (`/inventory`)

Transaction-based stock tracking:
- Every stock movement logged in `inventory_transactions`
- Types: purchase_in, sale_out, adjustment, return
- Polymorphic reference: `reference_type` + `reference_id` links to source document
- `products.quantity_on_hand` cached and atomically updated

**Key patterns:**
- Overview page with 4 summary cards: active products, low stock, out of stock, total stock value
- Stock alerts table: products at or below reorder level, sorted by quantity ascending
- Recent transactions table with product name join, type badges, signed quantity display
- Stock value calculated as `sum(quantity_on_hand * purchase_price)` for active products

## Database Tables

See `docs/database.md` for full schema reference.

| Table | Purpose |
|-------|---------|
| companies | Business entities (supplier, customer, both) |
| products | Product catalog with stock levels |
| purchase_invoices | Bills from supplier companies |
| purchase_invoice_items | Line items on invoices |
| payments | Payments against invoices |
| inventory_transactions | Stock movement audit log |

## Conventions

- All server actions follow the pattern in `src/app/apps/actions.ts`
- Zod schemas in `src/lib/validations/{module}.ts`
- Components in `src/components/{module}/`
- Pages use `export const dynamic = "force-dynamic"` for fresh data
- `revalidatePath` after every mutation
- Error handling: try-catch with user-friendly messages, FK violation handling
- Structured logging: `console.error("[actionName]", { contextId, error: String(err) })`
- Type-safe error checks: use `typeof err === "object" && "code" in err` instead of `as` casts
- Module-level constants for static arrays to avoid re-creation on render (e.g. `PRODUCT_FIELDS`)
