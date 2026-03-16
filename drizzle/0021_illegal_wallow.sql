CREATE TYPE "public"."sales_order_status" AS ENUM('pending', 'shipped', 'cancelled', 'returned', 'failed');--> statement-breakpoint
CREATE TABLE "sales_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"external_item_id" varchar(255) NOT NULL,
	"product_id" integer,
	"sku" varchar(255),
	"title" varchar(500),
	"quantity" integer NOT NULL,
	"price" numeric(12, 2)
);
--> statement-breakpoint
ALTER TABLE "sales_order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"external_order_id" varchar(255) NOT NULL,
	"status" "sales_order_status" DEFAULT 'pending' NOT NULL,
	"total_amount" numeric(12, 2),
	"currency" varchar(10),
	"buyer_name" varchar(255),
	"buyer_email" varchar(255),
	"purchased_at" timestamp,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_order_items_order_ext_idx" ON "sales_order_items" USING btree ("order_id","external_item_id");--> statement-breakpoint
CREATE INDEX "sales_order_items_order_idx" ON "sales_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_channel_ext_idx" ON "sales_orders" USING btree ("channel_id","external_order_id");--> statement-breakpoint
CREATE INDEX "sales_orders_channel_idx" ON "sales_orders" USING btree ("channel_id");