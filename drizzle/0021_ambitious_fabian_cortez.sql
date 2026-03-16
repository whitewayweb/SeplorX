CREATE TABLE "channel_product_changelog" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"channel_product_id" integer NOT NULL,
	"external_product_id" varchar(100) NOT NULL,
	"delta" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'staged' NOT NULL,
	"error_line" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "channel_product_changelog" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "publish_history" CASCADE;--> statement-breakpoint
ALTER TABLE "channel_product_changelog" ADD CONSTRAINT "channel_product_changelog_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_product_changelog" ADD CONSTRAINT "channel_product_changelog_channel_product_id_channel_products_id_fk" FOREIGN KEY ("channel_product_id") REFERENCES "public"."channel_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_product_changelog_channel_idx" ON "channel_product_changelog" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "channel_product_changelog_product_idx" ON "channel_product_changelog" USING btree ("channel_product_id");