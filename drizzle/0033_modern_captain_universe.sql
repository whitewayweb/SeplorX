ALTER TABLE "channel_product_sync_job_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "channel_product_sync_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_sync_job_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_sync_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_bundles" (
	"id" serial PRIMARY KEY NOT NULL,
	"bundle_product_id" integer NOT NULL,
	"component_product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "product_bundles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_bundle') THEN
    ALTER TABLE "products" ADD COLUMN "is_bundle" boolean DEFAULT false NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_bundles_bundle_product_id_products_id_fk') THEN
        ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_bundle_product_id_products_id_fk" FOREIGN KEY ("bundle_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_bundles_component_product_id_products_id_fk') THEN
        ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_bundles_not_self_referential') THEN
        ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_not_self_referential" CHECK ("bundle_product_id" <> "component_product_id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_bundles_quantity_positive') THEN
        ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_quantity_positive" CHECK ("quantity" > 0);
    END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_bundles_unique_link" ON "product_bundles" USING btree ("bundle_product_id","component_product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_bundles_bundle_idx" ON "product_bundles" USING btree ("bundle_product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_bundles_component_idx" ON "product_bundles" USING btree ("component_product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_is_bundle_idx" ON "products" USING btree ("is_bundle");