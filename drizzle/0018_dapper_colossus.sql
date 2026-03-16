CREATE TABLE IF NOT EXISTS "publish_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"external_product_id" varchar(100) NOT NULL,
	"changes" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'success' NOT NULL,
	"error_line" text,
	"reverted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publish_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "channel_product_mappings" ADD COLUMN IF NOT EXISTS "staged_changes" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publish_history" ADD CONSTRAINT "publish_history_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publish_history" ADD CONSTRAINT "publish_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publish_history_channel_idx" ON "publish_history" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publish_history_product_idx" ON "publish_history" USING btree ("product_id");