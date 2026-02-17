CREATE TYPE "public"."company_type" AS ENUM('supplier', 'customer', 'both');--> statement-breakpoint
ALTER TABLE "vendors" RENAME TO "companies";--> statement-breakpoint
ALTER TABLE "purchase_invoices" RENAME COLUMN "vendor_id" TO "company_id";--> statement-breakpoint
ALTER TABLE "purchase_invoices" DROP CONSTRAINT "purchase_invoices_vendor_id_vendors_id_fk";
--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT "vendors_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "purchase_invoices_vendor_idx";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "type" "company_type" DEFAULT 'supplier' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_invoices_company_idx" ON "purchase_invoices" USING btree ("company_id");