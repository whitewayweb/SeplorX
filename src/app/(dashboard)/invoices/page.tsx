import { db } from "@/db";
import { purchaseInvoices, companies, products } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { InvoiceList } from "@/components/invoices/invoice-list";
import { InvoiceDialog } from "@/components/invoices/invoice-dialog";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const invoiceList = await db
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
    .orderBy(desc(purchaseInvoices.createdAt));

  // Fetch supplier companies for the create dialog
  const supplierCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
    })
    .from(companies)
    .where(eq(companies.isActive, true))
    .orderBy(companies.name);

  // Fetch active products for line item selection
  const activeProducts = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      purchasePrice: products.purchasePrice,
      unit: products.unit,
    })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(products.name);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchase Invoices</h1>
          <p className="text-muted-foreground">
            Record and track bills from your suppliers.
          </p>
        </div>
        <InvoiceDialog companies={supplierCompanies} products={activeProducts} />
      </div>

      <InvoiceList invoices={invoiceList} />
    </div>
  );
}
