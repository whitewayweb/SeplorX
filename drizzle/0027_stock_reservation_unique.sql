-- 0027: Performance indexes + stock reservation uniqueness + return_disposition enum extension
-- Safe to run on existing databases (IF NOT EXISTS on all indexes).

-- 1. Add 'completed' to return_disposition enum (for mixed-action returns)
ALTER TYPE "return_disposition" ADD VALUE IF NOT EXISTS 'completed';

-- 2. Performance indexes for common query patterns

-- Products: isActive filter used by 4+ queries on dashboard/inventory
CREATE INDEX IF NOT EXISTS "products_is_active_idx"
  ON "products" ("is_active");

-- Inventory transactions: ORDER BY created_at DESC on /inventory and /products/[id]
CREATE INDEX IF NOT EXISTS "inventory_transactions_created_at_idx"
  ON "inventory_transactions" ("created_at" DESC);

-- Sales orders: purchased_at DESC for recent orders on dashboard
CREATE INDEX IF NOT EXISTS "sales_orders_purchased_at_idx"
  ON "sales_orders" ("purchased_at" DESC);

-- Sales orders: return_disposition filter (may have been dropped in older migrations)
CREATE INDEX IF NOT EXISTS "sales_orders_return_disposition_idx"
  ON "sales_orders" ("return_disposition");

-- Sales order items: productId for retroactive mapping queries (WHERE product_id IS NULL)
CREATE INDEX IF NOT EXISTS "sales_order_items_product_idx"
  ON "sales_order_items" ("product_id");

-- 3. Stock reservation concurrency safety
CREATE UNIQUE INDEX IF NOT EXISTS "stock_reservations_item_product_unique"
  ON "stock_reservations" ("order_item_id", "product_id");

-- 4. Re-create any previously dropped channel indexes (safe, IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "channel_product_mappings_channel_idx"
  ON "channel_product_mappings" ("channel_id");

CREATE INDEX IF NOT EXISTS "channel_products_channel_idx"
  ON "channel_products" ("channel_id");
