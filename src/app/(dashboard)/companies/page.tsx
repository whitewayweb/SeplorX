import { getAuthenticatedUserId } from "@/lib/auth";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { CompanyList } from "@/components/organisms/companies/company-list";
import { CompanyDialog } from "@/components/organisms/companies/company-dialog";
import { getCompaniesList } from "@/data/companies";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  await getAuthenticatedUserId();

  const companyList = await getCompaniesList();

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
