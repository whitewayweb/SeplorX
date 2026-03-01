CREATE TABLE "channel_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"name" varchar(500) NOT NULL,
	"sku" varchar(255),
	"stock_quantity" integer,
	"type" varchar(50),
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "channel_products" ADD CONSTRAINT "channel_products_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_products_unique_ext_id" ON "channel_products" USING btree ("channel_id","external_id");