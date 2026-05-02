import { sql } from "drizzle-orm";
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
  "sale_reserve",
  "sale_cancel",
  "return_restock",
  "return_discard",
]);

export const stockReservationStatusEnum = pgEnum("stock_reservation_status", [
  "active",
  "committed",
  "released",
]);

export const returnDispositionEnum = pgEnum("return_disposition", [
  "pending_inspection",
  "restocked",
  "discarded",
  "completed",   // Mixed: some items restocked, others discarded
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "pending_approval",
  "approved",
  "dismissed",
  "executed",
  "failed",
]);

export const channelStatusEnum = pgEnum("channel_status", [
  "pending",
  "connected",
  "disconnected",
]);

export const syncStatusEnum = pgEnum("sync_status", [
  "in_sync",
  "pending_update",
  "file_generating",
  "uploading",
  "processing",
  "failed",
]);

export const feedStatusEnum = pgEnum("feed_status", [
  "queued",
  "generating",
  "uploading",
  "in_progress",
  "done",
  "fatal",
]);

export const salesOrderStatusEnum = pgEnum("sales_order_status", [
  "pending",
  "processing",
  "on-hold",
  "packed",
  "shipped",
  "delivered", // corresponds to WC 'completed'
  "cancelled",
  "returned",
  "refunded",
  "failed",
  "draft"
]);
export type SalesOrderStatus = typeof salesOrderStatusEnum.enumValues[number];

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  password: varchar("password", { length: 255 }),
  role: roleEnum("role").default("customer").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}).enableRLS();

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("sessions_user_idx").on(table.userId)
]).enableRLS();

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("accounts_user_idx").on(table.userId)
]).enableRLS();

export const verifications = pgTable("verifications", {
  id: serial("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("verifications_identifier_idx").on(table.identifier)
]).enableRLS();

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
]).enableRLS();

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
}).enableRLS();

// ─── Products ────────────────────────────────────────────────────────────────

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 100 }).unique(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  attributes: jsonb("attributes").$type<Record<string, string>>().default({}).notNull(),
  unit: varchar("unit", { length: 50 }).default("pcs").notNull(),
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 2 }),
  sellingPrice: decimal("selling_price", { precision: 12, scale: 2 }),
  reorderLevel: integer("reorder_level").default(0).notNull(),
  quantityOnHand: integer("quantity_on_hand").default(0).notNull(),
  reservedQuantity: integer("reserved_quantity").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isBundle: boolean("is_bundle").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("products_attributes_idx").using("gin", table.attributes),
  index("products_is_active_idx").on(table.isActive),
  index("products_is_bundle_idx").on(table.isBundle),
]).enableRLS();

// ─── Product Bundles ─────────────────────────────────────────────────────────

export const productBundles = pgTable("product_bundles", {
  id: serial("id").primaryKey(),
  bundleProductId: integer("bundle_product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  componentProductId: integer("component_product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("product_bundles_unique_link").on(table.bundleProductId, table.componentProductId),
  index("product_bundles_bundle_idx").on(table.bundleProductId),
  index("product_bundles_component_idx").on(table.componentProductId),
  sql`CONSTRAINT "product_bundles_not_self_referential" CHECK ("bundle_product_id" <> "component_product_id")`,
  sql`CONSTRAINT "product_bundles_quantity_positive" CHECK ("quantity" > 0)`,
]).enableRLS();

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
]).enableRLS();

// ─── Purchase Invoice Items ──────────────────────────────────────────────────

export const purchaseInvoiceItems = pgTable("purchase_invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => purchaseInvoices.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  taxPercent: decimal("tax_percent", { precision: 5, scale: 2 }).default("0").notNull(),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
}, (table) => [
  index("purchase_invoice_items_invoice_idx").on(table.invoiceId),
]).enableRLS();

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
]).enableRLS();

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
  index("inventory_transactions_created_at_idx").on(table.createdAt),
]).enableRLS();

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
]).enableRLS();

// ─── Channels ────────────────────────────────────────────────────────────────
// Each row = one user-defined e-commerce order channel instance.
// Multiple rows of the same channelType are allowed (multi-store).
// credentials JSONB holds encrypted OAuth keys (consumerKey, consumerSecret).

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channelType: varchar("channel_type", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: channelStatusEnum("status").default("pending").notNull(),
  storeUrl: varchar("store_url", { length: 500 }),
  defaultPickupLocation: varchar("default_pickup_location", { length: 255 }),
  credentials: jsonb("credentials").$type<Record<string, string>>().default({}).notNull(),
  lastOrderSyncAt: timestamp("last_order_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("channels_user_idx").on(table.userId),
]).enableRLS();

// ─── Channel Product Mappings ─────────────────────────────────────────────────
// Links a SeplorX product to one or more external product IDs on a channel.
// Unique constraint: (channel_id, external_product_id) — one WC product maps
// to at most one SeplorX product per channel (prevents webhook ambiguity).
// One SeplorX product CAN have multiple rows per channel (e.g. "Yellow Buffer"
// → WC products 55 "Series A", 56 "Series B", 57 "4pc pack").

export const channelProductMappings = pgTable("channel_product_mappings", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  externalProductId: varchar("external_product_id", { length: 100 }).notNull(),
  label: varchar("label", { length: 255 }),
  syncStatus: syncStatusEnum("sync_status").default("in_sync").notNull(),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("channel_product_mappings_ext_unique").on(table.channelId, table.externalProductId),
  index("channel_product_mappings_channel_idx").on(table.channelId),
  index("channel_product_mappings_product_idx").on(table.productId),
  index("channel_product_mappings_sync_status_idx").on(table.syncStatus),
]).enableRLS();

// ─── Channel Products (Cache) ────────────────────────────────────────────────
// A local cache of external channel products pulled from the platforms' APIs.
// This allows SeplorX to map products lighting-fast without hitting external
// API rate limits or waiting on network latency.
export const channelProducts = pgTable("channel_products", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  sku: varchar("sku", { length: 255 }),
  stockQuantity: integer("stock_quantity"),
  type: varchar("type", { length: 50 }),
  rawData: jsonb("raw_data").default({}).notNull(),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("channel_products_unique_ext_id").on(table.channelId, table.externalId),
  index("channel_products_channel_idx").on(table.channelId),
]).enableRLS();

// ─── Channel Product Sync Jobs ──────────────────────────────────────────────
// Durable reconciliation jobs for importing external channel listings into the
// local channel_products cache. Amazon report generation can outlive a single
// request, so jobs persist report IDs, progress counts, and item-level failures.

export const channelProductSyncJobs = pgTable("channel_product_sync_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 30 }).default("queued").notNull(),
  phase: varchar("phase", { length: 50 }).default("creating_report").notNull(),
  reportId: varchar("report_id", { length: 255 }),
  reportDocumentId: varchar("report_document_id", { length: 255 }),
  totalCount: integer("total_count").default(0).notNull(),
  importedCount: integer("imported_count").default(0).notNull(),
  enrichedCount: integer("enriched_count").default(0).notNull(),
  failedCount: integer("failed_count").default(0).notNull(),
  skippedCount: integer("skipped_count").default(0).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("channel_product_sync_jobs_user_idx").on(table.userId),
  index("channel_product_sync_jobs_channel_idx").on(table.channelId),
  index("channel_product_sync_jobs_status_idx").on(table.status),
]).enableRLS();

export const channelProductSyncJobItems = pgTable("channel_product_sync_job_items", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => channelProductSyncJobs.id, { onDelete: "cascade" }),
  channelProductId: integer("channel_product_id").references(() => channelProducts.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 255 }),
  rawData: jsonb("raw_data").default({}).notNull(),
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => [
  uniqueIndex("channel_product_sync_job_items_job_ext_idx").on(table.jobId, table.externalId),
  index("channel_product_sync_job_items_job_idx").on(table.jobId),
  index("channel_product_sync_job_items_status_idx").on(table.status),
  index("channel_product_sync_job_items_product_idx").on(table.channelProductId),
]).enableRLS();

// ─── Stock Sync Jobs ────────────────────────────────────────────────────────
// Durable progress/audit rows for product stock reconciliation pushes.
// A job is scoped to one SeplorX product and contains one item per mapped
// channel listing.

export const stockSyncJobs = pgTable("stock_sync_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  status: varchar("status", { length: 30 }).default("queued").notNull(),
  totalCount: integer("total_count").default(0).notNull(),
  pushedCount: integer("pushed_count").default(0).notNull(),
  failedCount: integer("failed_count").default(0).notNull(),
  skippedCount: integer("skipped_count").default(0).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("stock_sync_jobs_user_idx").on(table.userId),
  index("stock_sync_jobs_product_idx").on(table.productId),
  index("stock_sync_jobs_status_idx").on(table.status),
]).enableRLS();

export const stockSyncJobItems = pgTable("stock_sync_job_items", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => stockSyncJobs.id, { onDelete: "cascade" }),
  mappingId: integer("mapping_id").notNull().references(() => channelProductMappings.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  channelName: varchar("channel_name", { length: 255 }).notNull(),
  externalProductId: varchar("external_product_id", { length: 255 }).notNull(),
  label: text("label"),
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  channelStock: integer("channel_stock"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => [
  uniqueIndex("stock_sync_job_items_job_mapping_idx").on(table.jobId, table.mappingId),
  index("stock_sync_job_items_job_idx").on(table.jobId),
  index("stock_sync_job_items_status_idx").on(table.status),
  index("stock_sync_job_items_mapping_idx").on(table.mappingId),
]).enableRLS();

// ─── Settings ────────────────────────────────────────────────────────────────
// Scalable key-value store for all platform-wide configuration (agent toggles,
// theme, notifications, etc.). Keys are namespaced by convention:
//   agent:{agentId}:isActive  → boolean
//   billing:currency          → string
// No userId — these are global settings, not per-user.

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(), // e.g., 'agent:reorder:isActive'
  value: jsonb("value").notNull(),                         // boolean, string, number, or object
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}).enableRLS();

// ─── Channel Feeds (Upload History) ──────────────────────────────────────────
// Tracks each template file submission to Amazon SP-API Feeds.
// One row per feed submission — linked to a channel, grouped by category.

export const channelFeeds = pgTable("channel_feeds", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  feedId: varchar("feed_id", { length: 255 }),
  feedDocumentId: varchar("feed_document_id", { length: 255 }),
  feedType: varchar("feed_type", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  status: feedStatusEnum("status").default("queued").notNull(),
  productCount: integer("product_count").default(0).notNull(),
  errorCount: integer("error_count").default(0),
  uploadUrl: text("upload_url"),
  resultDocumentUrl: text("result_document_url"),
  errorMessage: text("error_message"),
  mappingIds: jsonb("mapping_ids").$type<number[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("channel_feeds_channel_idx").on(table.channelId),
  index("channel_feeds_status_idx").on(table.status),
]).enableRLS();

// ─── Channel Product Changelog ───────────────────────────────────────────────
// Append-only audit log of field-level deltas for channel product edits.
// Each row stores only the NEW values of fields that changed in a single edit.
// "Old" values are derived by looking at the previous entry (by created_at)
// for the same channel product. Staged entries are merged at publish time —
// all unpublished deltas for a product are combined into one push payload
// (latest value wins per field).

export const channelProductChangelog = pgTable("channel_product_changelog", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  channelProductId: integer("channel_product_id").notNull().references(() => channelProducts.id, { onDelete: "cascade" }),
  externalProductId: varchar("external_product_id", { length: 100 }).notNull(),
  delta: jsonb("delta").$type<Record<string, unknown>>().notNull(),
  status: varchar("status", { length: 50 }).default("staged").notNull(), // 'staged', 'success', 'failed'
  errorLine: text("error_line"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
}, (table) => [
  index("channel_product_changelog_channel_idx").on(table.channelId),
  index("channel_product_changelog_product_idx").on(table.channelProductId),
]).enableRLS();

// ─── Sales Orders ────────────────────────────────────────────────────────────
// Tracks customer orders fetched from external channels (Amazon, etc).

export const salesOrders = pgTable("sales_orders", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  externalOrderId: varchar("external_order_id", { length: 255 }).notNull(),
  status: salesOrderStatusEnum("status").default("pending").notNull(),
  previousStatus: salesOrderStatusEnum("previous_status"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 10 }),
  buyerName: varchar("buyer_name", { length: 255 }),
  buyerEmail: varchar("buyer_email", { length: 255 }),
  purchasedAt: timestamp("purchased_at"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  returnDisposition: returnDispositionEnum("return_disposition"),
  returnNotes: text("return_notes"),
  stockProcessed: boolean("stock_processed").default(false).notNull(),
}, (table) => [
  uniqueIndex("sales_orders_channel_ext_idx").on(table.channelId, table.externalOrderId),
  index("sales_orders_channel_idx").on(table.channelId),
  index("sales_orders_status_idx").on(table.status),
  index("sales_orders_return_disposition_idx").on(table.returnDisposition),
  index("sales_orders_purchased_at_idx").on(table.purchasedAt),
]).enableRLS();

export const salesOrderItems = pgTable("sales_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
  externalItemId: varchar("external_item_id", { length: 255 }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  sku: varchar("sku", { length: 255 }),
  title: varchar("title", { length: 500 }),
  quantity: integer("quantity").notNull(),
  price: decimal("price", { precision: 12, scale: 2 }),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  returnQuantity: integer("return_quantity").default(0).notNull(),
  returnDisposition: returnDispositionEnum("return_disposition"),
}, (table) => [
  uniqueIndex("sales_order_items_order_ext_idx").on(table.orderId, table.externalItemId),
  index("sales_order_items_order_idx").on(table.orderId),
  index("sales_order_items_product_idx").on(table.productId),
]).enableRLS();

// ─── Stock Reservations ──────────────────────────────────────────────────────
// Ledger of stock reserved for active (unfulfilled) sales orders.
// Each row maps one order item to one SeplorX product.
// status: 'active' = reserved, 'committed' = delivered (stock deducted),
//         'released' = cancelled/refunded (reservation freed).

export const stockReservations = pgTable("stock_reservations", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
  orderItemId: integer("order_item_id").notNull().references(() => salesOrderItems.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  status: stockReservationStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  uniqueIndex("stock_reservations_item_product_unique").on(table.orderItemId, table.productId),
  index("stock_reservations_order_idx").on(table.orderId),
  index("stock_reservations_product_idx").on(table.productId),
  index("stock_reservations_status_idx").on(table.status),
]).enableRLS();
