ALTER TYPE "public"."sales_order_status" ADD VALUE 'processing';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'on-hold';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'packed';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'completed';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'refunded';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'checkout-draft';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'trash';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'PendingAvailability';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'Pending';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'Unshipped';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'PartiallyShipped';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'InvoiceUnconfirmed';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'Canceled';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'Unfulfillable';