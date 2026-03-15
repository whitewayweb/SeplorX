ALTER TABLE "publish_history" ALTER COLUMN "status" SET DEFAULT 'staged';--> statement-breakpoint
ALTER TABLE "channel_product_mappings" DROP COLUMN "staged_changes";--> statement-breakpoint
ALTER TABLE "publish_history" DROP COLUMN "reverted_at";