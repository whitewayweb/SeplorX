import { getAuthenticatedUserId } from "@/lib/auth";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { OcrUploadTrigger } from "@/components/organisms/agents/ocr-upload-trigger";
import { OcrApprovalCard } from "@/components/organisms/agents/ocr-approval-card";
import type { ExtractedInvoice } from "@/lib/agents/ocr-agent";
import { getPendingAgentTasks } from "@/data/agents";
import { getActiveSupplierCompanies } from "@/data/companies";
import { getActiveProductsForDropdown } from "@/data/products";
import { getExistingInvoicesForDuplicateCheck } from "@/data/invoices";

export const dynamic = "force-dynamic";

export default async function PurchaseBillsPage() {
  const userId = await getAuthenticatedUserId();

  // Run initial queries in parallel
  const [pendingOcrTasks, supplierCompanies, activeProducts] = await Promise.all([
    getPendingAgentTasks("invoice_ocr"),
    getActiveSupplierCompanies(),
    getActiveProductsForDropdown()
  ]);

  // 4. Batched Duplicate Check (Fix N+1 query)
  type DuplicateInfo = { invoiceDate: string | null; totalAmount: string } | null;
  const duplicateInfoMap = new Map<number, DuplicateInfo>();

  // Extract necessary parameters to batch the query
  const duplicateCheckParams: { taskId: number; invoiceNumber: string; companyId: number }[] = [];

  for (const task of pendingOcrTasks) {
    const plan = task.plan as unknown as ExtractedInvoice;
    if (!plan.invoiceNumber || !plan.supplierName) {
      duplicateInfoMap.set(task.id, null);
      continue;
    }

    const needle = plan.supplierName.toLowerCase();
    const matchedSupplier = supplierCompanies.find(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        needle.includes(s.name.toLowerCase())
    );

    if (!matchedSupplier) {
      duplicateInfoMap.set(task.id, null);
      continue;
    }

    // Prepare for batched query instead of hitting DB here
    duplicateCheckParams.push({
      taskId: task.id,
      invoiceNumber: plan.invoiceNumber,
      companyId: matchedSupplier.id
    });
  }

  // Execute single batched query if there are items to check
  if (duplicateCheckParams.length > 0) {
    const invoiceNumbers = Array.from(new Set(duplicateCheckParams.map(p => p.invoiceNumber)));
    
    // We fetch potential matches and filter them in memory to avoid complex combo queries
    const existingInvoices = await getExistingInvoicesForDuplicateCheck(invoiceNumbers, userId);

    // Populate the map with results
    for (const param of duplicateCheckParams) {
      const match = existingInvoices.find(
        inv => inv.invoiceNumber === param.invoiceNumber && inv.companyId === param.companyId
      );
      duplicateInfoMap.set(param.taskId, match ?? null);
    }
  }

  return (
    <div className="p-6 space-y-8">
      <PageHeader
        title="Purchase Bills"
        description="Upload supplier invoices — AI extracts the details for your review."
      />

      {AGENT_REGISTRY.invoice_ocr.enabled && (
        <div className="max-w-lg">
          <OcrUploadTrigger />
        </div>
      )}



      {pendingOcrTasks.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Pending Review</h2>
          {pendingOcrTasks.map((task) => (
            <OcrApprovalCard
              key={task.id}
              taskId={task.id}
              plan={task.plan as unknown as ExtractedInvoice}
              createdAt={task.createdAt}
              suppliers={supplierCompanies}
              products={activeProducts}
              duplicateInfo={duplicateInfoMap.get(task.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
