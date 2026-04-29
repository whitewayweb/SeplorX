ALTER TABLE "channel_product_sync_job_items" ADD COLUMN "raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL;
