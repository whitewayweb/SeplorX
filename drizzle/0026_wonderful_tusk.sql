CREATE TYPE "public"."return_disposition" AS ENUM('pending_inspection', 'restocked', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."stock_reservation_status" AS ENUM('active', 'committed', 'released');--> statement-breakpoint
ALTER TYPE "public"."inventory_transaction_type" ADD VALUE 'sale_reserve';--> statement-breakpoint
ALTER TYPE "public"."inventory_transaction_type" ADD VALUE 'sale_cancel';--> statement-breakpoint
ALTER TYPE "public"."inventory_transaction_type" ADD VALUE 'return_restock';--> statement-breakpoint
ALTER TYPE "public"."inventory_transaction_type" ADD VALUE 'return_discard';--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"order_item_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"status" "stock_reservation_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "stock_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "reserved_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "return_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "return_disposition" "return_disposition";--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "previous_status" "sales_order_status";--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "return_disposition" "return_disposition";--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "return_notes" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "stock_processed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_item_id_sales_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."sales_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_reservations_order_idx" ON "stock_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_product_idx" ON "stock_reservations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_status_idx" ON "stock_reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_attributes_idx" ON "products" USING gin ("attributes");--> statement-breakpoint
CREATE INDEX "sales_orders_status_idx" ON "sales_orders" USING btree ("status");