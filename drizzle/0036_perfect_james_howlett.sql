ALTER TABLE "sales_order_finance_syncs" ADD COLUMN "next_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "sales_order_finance_syncs" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "sales_order_finance_syncs_next_attempt_idx" ON "sales_order_finance_syncs" USING btree ("next_attempt_at");