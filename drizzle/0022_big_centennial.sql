ALTER TABLE "sales_order_items" ADD COLUMN "raw_data" jsonb;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "raw_data" jsonb;