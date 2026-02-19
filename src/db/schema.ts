import {
  pgTable,
  serial,
  varchar,
  timestamp,
  pgEnum,
  integer,
  jsonb,
  uniqueIndex,
  text,
  boolean,
  decimal,
  date,
  index,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["admin", "customer", "vendor"]);
export const appStatusEnum = pgEnum("app_status", ["installed", "configured"]);
export const companyTypeEnum = pgEnum("company_type", [
  "supplier",
  "customer",
  "both",
]);

export const purchaseInvoiceStatusEnum = pgEnum("purchase_invoice_status", [
  "draft",
  "received",
  "partial",
  "paid",
  "cancelled",
]);

export const paymentModeEnum = pgEnum("payment_mode", [
  "cash",
  "bank_transfer",
  "upi",
  "cheque",
  "other",
]);

export const inventoryTransactionTypeEnum = pgEnum("inventory_transaction_type", [
  "purchase_in",
  "sale_out",
  "adjustment",
  "return",
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "pending_approval",
  "approved",
  "dismissed",
  "executed",
  "failed",
]);

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }),
  role: roleEnum("role").default("customer").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── App Installations ───────────────────────────────────────────────────────

export const appInstallations = pgTable("app_installations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  appId: varchar("app_id", { length: 100 }).notNull(),
  status: appStatusEnum("status").default("installed").notNull(),
  config: jsonb("config").$type<Record<string, string>>().default({}).notNull(),
  installedAt: timestamp("installed_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("app_installations_user_app_idx").on(table.userId, table.appId),
]);

// ─── Companies ──────────────────────────────────────────────────────────────

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: companyTypeEnum("type").default("supplier").notNull(),
  contactPerson: varchar("contact_person", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  gstNumber: varchar("gst_number", { length: 50 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  pincode: varchar("pincode", { length: 20 }),
  notes: text("notes"),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Products ────────────────────────────────────────────────────────────────

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 100 }).unique(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 50 }).default("pcs").notNull(),
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 2 }),
  sellingPrice: decimal("selling_price", { precision: 12, scale: 2 }),
  reorderLevel: integer("reorder_level").default(0).notNull(),
  quantityOnHand: integer("quantity_on_hand").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Purchase Invoices ───────────────────────────────────────────────────────

export const purchaseInvoices = pgTable("purchase_invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  status: purchaseInvoiceStatusEnum("status").default("received").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0").notNull(),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  amountPaid: decimal("amount_paid", { precision: 12, scale: 2 }).default("0").notNull(),
  notes: text("notes"),
  fileUrl: varchar("file_url", { length: 500 }),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("purchase_invoices_company_idx").on(table.companyId),
  index("purchase_invoices_status_idx").on(table.status),
  uniqueIndex("purchase_invoices_company_invoice_unique").on(table.companyId, table.invoiceNumber),
]);

// ─── Purchase Invoice Items ──────────────────────────────────────────────────

export const purchaseInvoiceItems = pgTable("purchase_invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => purchaseInvoices.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  taxPercent: decimal("tax_percent", { precision: 5, scale: 2 }).default("0").notNull(),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
}, (table) => [
  index("purchase_invoice_items_invoice_idx").on(table.invoiceId),
]);

// ─── Payments ────────────────────────────────────────────────────────────────

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => purchaseInvoices.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  paymentMode: paymentModeEnum("payment_mode").default("bank_transfer").notNull(),
  reference: varchar("reference", { length: 255 }),
  notes: text("notes"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("payments_invoice_idx").on(table.invoiceId),
]);

// ─── Inventory Transactions ──────────────────────────────────────────────────

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  type: inventoryTransactionTypeEnum("type").notNull(),
  quantity: integer("quantity").notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: integer("reference_id"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("inventory_transactions_product_idx").on(table.productId),
  index("inventory_transactions_reference_idx").on(table.referenceType, table.referenceId),
]);

// ─── Agent Actions ────────────────────────────────────────────────────────────
// Audit log and approval queue for all AI agent recommendations.
// Agents write here; humans approve/dismiss; Server Actions execute approved plans.

export const agentActions = pgTable("agent_actions", {
  id: serial("id").primaryKey(),
  agentType: varchar("agent_type", { length: 100 }).notNull(),
  status: agentStatusEnum("status").default("pending_approval").notNull(),
  plan: jsonb("plan").notNull(),
  rationale: text("rationale"),
  toolCalls: jsonb("tool_calls"),
  resolvedBy: integer("resolved_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("agent_actions_status_idx").on(table.status),
  index("agent_actions_agent_type_idx").on(table.agentType),
]);
