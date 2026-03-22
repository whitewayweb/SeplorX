import { getAuthenticatedUserId } from "@/lib/auth";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { InvoiceList } from "@/components/organisms/invoices/invoice-list";
import { InvoiceDialog } from "@/components/organisms/invoices/invoice-dialog";
import { getInvoicesList } from "@/data/invoices";
import { getActiveCompaniesForDropdown } from "@/data/companies";
import { getActiveProductsForDropdown } from "@/data/products";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const userId = await getAuthenticatedUserId();

  const [invoiceList, supplierCompanies, activeProducts] = await Promise.all([
    getInvoicesList(userId),
    getActiveCompaniesForDropdown(),
    getActiveProductsForDropdown()
  ]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Purchase Invoices"
        description="Record and track bills from your suppliers."
      >
        <InvoiceDialog companies={supplierCompanies} products={activeProducts} />
      </PageHeader>

      <InvoiceList invoices={invoiceList} />
    </div>
  );
}
