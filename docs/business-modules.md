# Business Modules

## Overview

SeplorX business modules provide vendor management, purchase invoice tracking, inventory/stock management, and payment recording for ecommerce operations.

## Architecture

### Vendor as Business Entity

Vendors have their own table — separate from `users`. A vendor represents a business/company (with GST, address, bank details) while a user represents a system login. The optional `user_id` FK on vendors allows future vendor portal access.

The `role` enum on `users` includes `"vendor"` for when vendors need login accounts, but the primary vendor management operates via the `vendors` table.

### Data Flow

```
Vendor → Purchase Invoice → Line Items → Products
                ↓                          ↓
             Payments            Inventory Transactions
                                         ↓
                                  Stock Level (cached)
```

1. **Create vendor** in the vendors table
2. **Record purchase invoice** with line items referencing products
3. **Stock updates** automatically when invoice is created (inventory transactions + cached quantity)
4. **Record payments** against invoices; status auto-updates (received → partial → paid)

## Modules

### Vendors (`/vendors`)

CRUD for supplier/vendor management. Each vendor has:
- Business info: name, GST number
- Contact info: person, email, phone
- Address: street, city, state, pincode
- Status: active/inactive toggle
- Notes: internal notes

**Key patterns:**
- Server actions for all mutations (`src/app/vendors/actions.ts`)
- Zod validation schemas (`src/lib/validations/vendors.ts`)
- Cannot delete vendors with existing invoices (FK constraint returns user-friendly error)

### Products (`/products`)

Product catalog with stock tracking:
- SKU (unique), name, description, category
- Purchase price, selling price
- Unit of measurement (pcs, kg, etc.)
- Reorder level (alert threshold)
- Quantity on hand (cached, updated via inventory transactions)

### Purchase Invoices (`/invoices`)

Bills received from vendors:
- Invoice number, vendor, dates
- Line items with product reference, quantity, unit price, tax
- Auto-calculated subtotal, tax, discount, total
- File upload for invoice PDF (deferred — column exists, UI added later)
- Status workflow: draft → received → partial → paid | cancelled

### Payments

Recorded against purchase invoices:
- Amount, date, payment mode (cash, bank transfer, UPI, cheque, other)
- Reference (cheque number, UTR, transaction ID)
- Multiple partial payments supported
- Invoice status auto-updates based on amount paid vs total

### Inventory (`/inventory`)

Transaction-based stock tracking:
- Every stock movement logged in `inventory_transactions`
- Types: purchase_in, sale_out, adjustment, return
- Polymorphic reference: `reference_type` + `reference_id` links to source document
- `products.quantity_on_hand` cached and atomically updated

## Database Tables

See `docs/database.md` for full schema reference.

| Table | Purpose |
|-------|---------|
| vendors | Supplier business entities |
| products | Product catalog with stock levels |
| purchase_invoices | Bills from vendors |
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
