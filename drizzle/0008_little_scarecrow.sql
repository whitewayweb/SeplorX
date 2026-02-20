CREATE TYPE "public"."channel_status" AS ENUM('pending', 'connected', 'disconnected');--> statement-breakpoint
CREATE TABLE "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"channel_type" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "channel_status" DEFAULT 'pending' NOT NULL,
	"store_url" varchar(500),
	"default_pickup_location" varchar(255),
	"credentials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channels_user_idx" ON "channels" USING btree ("user_id");