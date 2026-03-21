import { db } from "@/db";
import { agentActions, companies, products, purchaseInvoices } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/auth";
import { and, desc, eq, sql, inArray } from "drizzle-orm";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { OcrUploadTrigger } from "@/components/organisms/agents/ocr-upload-trigger";
import { OcrApprovalCard } from "@/components/organisms/agents/ocr-approval-card";
import type { ExtractedInvoice } from "@/lib/agents/ocr-agent";

export const dynamic = "force-dynamic";

export default async function PurchaseBillsPage() {
  const userId = await getAuthenticatedUserId();

  // Run initial queries in parallel
  const [pendingOcrTasks, supplierCompanies, activeProducts] = await Promise.all([
    // 1. Pending OCR tasks — filtered strictly to invoice_ocr agent type
    db
      .select({
        id: agentActions.id,
        plan: agentActions.plan,
        createdAt: agentActions.createdAt,
      })
      .from(agentActions)
      .where(
        and(
          eq(agentActions.status, "pending_approval"),
          eq(agentActions.agentType, "invoice_ocr")
        )
      )
      .orderBy(desc(agentActions.createdAt)),

    // 2. Active suppliers (type = supplier or both) for the approval card dropdown
    db
      .select({
        id: companies.id,
        name: companies.name,
        gstNumber: companies.gstNumber,
      })
      .from(companies)
      .where(
        and(
          eq(companies.isActive, true),
          sql`${companies.type} IN ('supplier', 'both')`,
          eq(companies.userId, userId)
        )
      )
      .orderBy(companies.name),

    // 3. Active products for line item linking in the approval card
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
    const existingInvoices = await db
      .select({
        invoiceDate: purchaseInvoices.invoiceDate,
        totalAmount: purchaseInvoices.totalAmount,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        companyId: purchaseInvoices.companyId
      })
      .from(purchaseInvoices)
      .where(
        and(
          // Safety in case the combination is too large, first filter by invoice numbers
          inArray(purchaseInvoices.invoiceNumber, invoiceNumbers),
          eq(purchaseInvoices.createdBy, userId) // Scope by user
        )
      );

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Purchase Bills</h1>
        <p className="text-muted-foreground mt-1">
          Upload supplier invoices — AI extracts the details for your review.
        </p>
      </div>

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
