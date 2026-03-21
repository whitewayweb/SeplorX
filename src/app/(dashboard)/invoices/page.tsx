import { db } from "@/db";
import { purchaseInvoices, companies, products } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { InvoiceList } from "@/components/organisms/invoices/invoice-list";
import { InvoiceDialog } from "@/components/organisms/invoices/invoice-dialog";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const userId = await getAuthenticatedUserId();

  const [invoiceList, supplierCompanies, activeProducts] = await Promise.all([
    // 1. Fetch invoices
    db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        companyId: purchaseInvoices.companyId,
        invoiceDate: purchaseInvoices.invoiceDate,
        dueDate: purchaseInvoices.dueDate,
        status: purchaseInvoices.status,
        totalAmount: purchaseInvoices.totalAmount,
        amountPaid: purchaseInvoices.amountPaid,
        companyName: companies.name,
      })
      .from(purchaseInvoices)
      .innerJoin(companies, eq(purchaseInvoices.companyId, companies.id))
      .where(eq(purchaseInvoices.createdBy, userId))
      .orderBy(desc(purchaseInvoices.createdAt)),

    // 2. Fetch supplier companies for the create dialog
    db
      .select({
        id: companies.id,
        name: companies.name,
      })
      .from(companies)
      .where(eq(companies.isActive, true))
      .orderBy(companies.name),

    // 3. Fetch active products for line item selection
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        purchasePrice: products.purchasePrice,
        unit: products.unit,
      })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(products.name)
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
