-- ALTER TYPE "public"."return_disposition" ADD VALUE 'completed';--> statement-breakpoint
ALTER TABLE "purchase_invoice_items" ALTER COLUMN "quantity" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_product_mappings_channel_idx" ON "channel_product_mappings" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_products_channel_idx" ON "channel_products" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_transactions_created_at_idx" ON "inventory_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_is_active_idx" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_order_items_product_idx" ON "sales_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_return_disposition_idx" ON "sales_orders" USING btree ("return_disposition");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_purchased_at_idx" ON "sales_orders" USING btree ("purchased_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_reservations_item_product_unique" ON "stock_reservations" USING btree ("order_item_id","product_id");