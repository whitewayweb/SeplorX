CREATE TABLE "channel_product_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"external_product_id" varchar(100) NOT NULL,
	"label" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "channel_product_mappings" ADD CONSTRAINT "channel_product_mappings_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_product_mappings" ADD CONSTRAINT "channel_product_mappings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_product_mappings_ext_unique" ON "channel_product_mappings" USING btree ("channel_id","external_product_id");--> statement-breakpoint
CREATE INDEX "channel_product_mappings_channel_idx" ON "channel_product_mappings" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "channel_product_mappings_product_idx" ON "channel_product_mappings" USING btree ("product_id");