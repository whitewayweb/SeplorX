-- Prevent duplicate stock reservations for the same order item + product.
-- This enforces idempotency at the DB level for concurrent calls to reserveStock().
CREATE UNIQUE INDEX IF NOT EXISTS "stock_reservations_item_product_unique"
  ON "stock_reservations" ("order_item_id", "product_id");
