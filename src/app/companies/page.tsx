import { db } from "@/db";
import { companies } from "@/db/schema";
import { desc } from "drizzle-orm";
import { CompanyList } from "@/components/companies/company-list";
import { CompanyDialog } from "@/components/companies/company-dialog";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const companyList = await db
    .select()
    .from(companies)
    .orderBy(desc(companies.createdAt));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
          <p className="text-muted-foreground">
            Manage your suppliers, customers, and business partners.
          </p>
        </div>
        <CompanyDialog />
      </div>

      <CompanyList companies={companyList} />
    </div>
  );
}
