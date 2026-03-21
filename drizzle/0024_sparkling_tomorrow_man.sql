ALTER TABLE "sales_orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sales_orders" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."sales_order_status";--> statement-breakpoint
CREATE TYPE "public"."sales_order_status" AS ENUM('pending', 'processing', 'on-hold', 'packed', 'shipped', 'delivered', 'cancelled', 'returned', 'refunded', 'failed', 'draft');--> statement-breakpoint
ALTER TABLE "sales_orders" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."sales_order_status";--> statement-breakpoint
ALTER TABLE "sales_orders" ALTER COLUMN "status" SET DATA TYPE "public"."sales_order_status" USING "status"::"public"."sales_order_status";