CREATE TABLE "channel_product_sync_job_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"channel_product_id" integer,
	"external_id" varchar(255) NOT NULL,
	"sku" varchar(255),
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "channel_product_sync_job_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "channel_product_sync_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"status" varchar(30) DEFAULT 'queued' NOT NULL,
	"phase" varchar(50) DEFAULT 'creating_report' NOT NULL,
	"report_id" varchar(255),
	"report_document_id" varchar(255),
	"total_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"enriched_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "channel_product_sync_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product_bundles" (
	"id" serial PRIMARY KEY NOT NULL,
	"bundle_product_id" integer NOT NULL,
	"component_product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "product_bundles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_sync_job_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"mapping_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"channel_name" varchar(255) NOT NULL,
	"external_product_id" varchar(255) NOT NULL,
	"label" text,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"channel_stock" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "stock_sync_job_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_sync_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"status" varchar(30) DEFAULT 'queued' NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"pushed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "stock_sync_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "last_order_sync_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_bundle" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_product_sync_job_items" ADD CONSTRAINT "channel_product_sync_job_items_job_id_channel_product_sync_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."channel_product_sync_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_product_sync_job_items" ADD CONSTRAINT "channel_product_sync_job_items_channel_product_id_channel_products_id_fk" FOREIGN KEY ("channel_product_id") REFERENCES "public"."channel_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_product_sync_jobs" ADD CONSTRAINT "channel_product_sync_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_product_sync_jobs" ADD CONSTRAINT "channel_product_sync_jobs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_bundle_product_id_products_id_fk" FOREIGN KEY ("bundle_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_sync_job_items" ADD CONSTRAINT "stock_sync_job_items_job_id_stock_sync_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."stock_sync_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_sync_job_items" ADD CONSTRAINT "stock_sync_job_items_mapping_id_channel_product_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."channel_product_mappings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_sync_job_items" ADD CONSTRAINT "stock_sync_job_items_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_sync_jobs" ADD CONSTRAINT "stock_sync_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_sync_jobs" ADD CONSTRAINT "stock_sync_jobs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_product_sync_job_items_job_ext_idx" ON "channel_product_sync_job_items" USING btree ("job_id","external_id");--> statement-breakpoint
CREATE INDEX "channel_product_sync_job_items_job_idx" ON "channel_product_sync_job_items" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "channel_product_sync_job_items_status_idx" ON "channel_product_sync_job_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "channel_product_sync_job_items_product_idx" ON "channel_product_sync_job_items" USING btree ("channel_product_id");--> statement-breakpoint
CREATE INDEX "channel_product_sync_jobs_user_idx" ON "channel_product_sync_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channel_product_sync_jobs_channel_idx" ON "channel_product_sync_jobs" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "channel_product_sync_jobs_status_idx" ON "channel_product_sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "product_bundles_unique_link" ON "product_bundles" USING btree ("bundle_product_id","component_product_id");--> statement-breakpoint
CREATE INDEX "product_bundles_bundle_idx" ON "product_bundles" USING btree ("bundle_product_id");--> statement-breakpoint
CREATE INDEX "product_bundles_component_idx" ON "product_bundles" USING btree ("component_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_sync_job_items_job_mapping_idx" ON "stock_sync_job_items" USING btree ("job_id","mapping_id");--> statement-breakpoint
CREATE INDEX "stock_sync_job_items_job_idx" ON "stock_sync_job_items" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "stock_sync_job_items_status_idx" ON "stock_sync_job_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stock_sync_job_items_mapping_idx" ON "stock_sync_job_items" USING btree ("mapping_id");--> statement-breakpoint
CREATE INDEX "stock_sync_jobs_user_idx" ON "stock_sync_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_sync_jobs_product_idx" ON "stock_sync_jobs" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stock_sync_jobs_status_idx" ON "stock_sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_is_bundle_idx" ON "products" USING btree ("is_bundle");