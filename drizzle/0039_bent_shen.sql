ALTER TABLE "expenses" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "company_id" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;