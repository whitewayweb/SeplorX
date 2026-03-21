import { db } from "@/db";
import { companies } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/auth";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { CompanyList } from "@/components/organisms/companies/company-list";
import { CompanyDialog } from "@/components/organisms/companies/company-dialog";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  await getAuthenticatedUserId();

  const companyList = await db
    .select({
      id: companies.id,
      name: companies.name,
      type: companies.type,
      contactPerson: companies.contactPerson,
      email: companies.email,
      phone: companies.phone,
      gstNumber: companies.gstNumber,
      address: companies.address,
      city: companies.city,
      state: companies.state,
      pincode: companies.pincode,
      notes: companies.notes,
      isActive: companies.isActive,
      createdAt: companies.createdAt,
    })
    .from(companies)
    .orderBy(desc(companies.createdAt));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Companies"
        description="Manage your suppliers, customers, and business partners."
      >
        <CompanyDialog />
      </PageHeader>

      <CompanyList companies={companyList} />
    </div>
  );
}
