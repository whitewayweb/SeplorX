import { db } from "@/db";
import { agentActions, companies, products } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { OcrUploadTrigger } from "@/components/agents/ocr-upload-trigger";
import { OcrApprovalCard } from "@/components/agents/ocr-approval-card";
import type { ExtractedInvoice } from "@/lib/agents/ocr-agent";

export const dynamic = "force-dynamic";

export default async function PurchaseBillsPage() {
  // 1. Pending OCR tasks — filtered strictly to invoice_ocr agent type
  const pendingOcrTasks = await db
    .select({
      id: agentActions.id,
      plan: agentActions.plan,
      createdAt: agentActions.createdAt,
    })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.status, "pending_approval"),
        eq(agentActions.agentType, "invoice_ocr"),
      ),
    )
    .orderBy(desc(agentActions.createdAt));

  // 2. Active suppliers (type = supplier or both) for the approval card dropdown
  const supplierCompanies = await db
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
      ),
    )
    .orderBy(companies.name);

  // 3. Active products for line item linking in the approval card
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
