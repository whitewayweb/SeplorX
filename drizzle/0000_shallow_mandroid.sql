CREATE TYPE "public"."app_status" AS ENUM('installed', 'configured');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'customer');--> statement-breakpoint
CREATE TABLE "app_installations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"app_id" varchar(100) NOT NULL,
	"status" "app_status" DEFAULT 'installed' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"installed_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"email" varchar(255) NOT NULL,
	"password" varchar(255),
	"role" "role" DEFAULT 'customer' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "app_installations" ADD CONSTRAINT "app_installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_installations_user_app_idx" ON "app_installations" USING btree ("user_id","app_id");