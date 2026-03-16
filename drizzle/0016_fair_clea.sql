DO $$ BEGIN
 CREATE TYPE "public"."feed_status" AS ENUM('queued', 'generating', 'uploading', 'in_progress', 'done', 'fatal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sync_status" AS ENUM('in_sync', 'pending_update', 'file_generating', 'uploading', 'processing', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_feeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"feed_id" varchar(255),
	"feed_document_id" varchar(255),
	"feed_type" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"status" "feed_status" DEFAULT 'queued' NOT NULL,
	"product_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0,
	"upload_url" text,
	"result_document_url" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "channel_feeds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "channel_product_mappings" ADD COLUMN IF NOT EXISTS "sync_status" "sync_status" DEFAULT 'in_sync' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_product_mappings" ADD COLUMN IF NOT EXISTS "last_sync_error" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "channel_feeds" ADD CONSTRAINT "channel_feeds_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_feeds_channel_idx" ON "channel_feeds" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_feeds_status_idx" ON "channel_feeds" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_product_mappings_sync_status_idx" ON "channel_product_mappings" USING btree ("sync_status");