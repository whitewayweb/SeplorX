"use server";

import { db } from "@/db";
import {
  agentActions,
  purchaseInvoices,
  purchaseInvoiceItems,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ReorderPlan } from "@/lib/agents/tools/inventory-tools";

// TODO: replace with auth() when auth is re-added
const CURRENT_USER_ID = 1;

const AgentTaskIdSchema = z.object({
  taskId: z.coerce.number().int().positive(),
});

// ─── Approve Reorder Plan ─────────────────────────────────────────────────────
// Atomically claims the task (status guard + mark executed in one UPDATE),
// then creates the draft invoice — all inside a single transaction.
// This prevents double-approval: a concurrent request finds status != pending_approval
// and gets 0 rows from the UPDATE, so it never reaches the invoice insert.

export async function approveReorderPlan(_prevState: unknown, formData: FormData) {
  const parsed = AgentTaskIdSchema.safeParse({ taskId: formData.get("taskId") });

  if (!parsed.success) {
    return { error: "Invalid task ID." };
  }

  const { taskId } = parsed.data;

  // Build invoice number outside the tx — deterministic, no I/O needed
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const invoiceNumber = `AI-PO-${dateStr}-${taskId}`;

  try {
    await db.transaction(async (tx) => {
      // 1. Atomically claim the task — only succeeds when status is still pending_approval.
      //    A concurrent approval will find 0 rows here and throw, rolling back cleanly.
      const [claimed] = await tx
        .update(agentActions)
        .set({ status: "executed", resolvedBy: CURRENT_USER_ID, resolvedAt: new Date() })
        .where(and(eq(agentActions.id, taskId), eq(agentActions.status, "pending_approval")))
        .returning({ id: agentActions.id, plan: agentActions.plan });

      if (!claimed) {
        throw Object.assign(new Error("This recommendation has already been resolved."), { userError: true });
      }

      const plan = claimed.plan as unknown as ReorderPlan;

      if (!plan.companyId || !Array.isArray(plan.items) || plan.items.length === 0) {
        throw Object.assign(new Error("Invalid plan data. Cannot create invoice."), { userError: true });
      }

      // 2. Compute totals (draft: no tax, no discount for agent proposals)
      let subtotal = 0;
      for (const item of plan.items) {
        subtotal += item.quantity * parseFloat(item.unitPrice);
      }
      const subtotalStr = subtotal.toFixed(2);

      // 3. Insert draft invoice
      const [invoice] = await tx
        .insert(purchaseInvoices)
        .values({
          invoiceNumber,
          companyId: plan.companyId,
          invoiceDate: today.toISOString().slice(0, 10),
          dueDate: null,
          status: "draft",
          subtotal: subtotalStr,
          taxAmount: "0",
          discountAmount: "0",
          totalAmount: subtotalStr,
          amountPaid: "0",
          notes: `Draft created by AI Reorder Agent. Reasoning: ${plan.reasoning}`,
          createdBy: CURRENT_USER_ID,
        })
        .returning({ id: purchaseInvoices.id });

      // 4. Insert line items (draft: no stock update, no inventory transaction)
      for (let i = 0; i < plan.items.length; i++) {
        const item = plan.items[i];
        const lineTotal = (item.quantity * parseFloat(item.unitPrice)).toFixed(2);

        await tx.insert(purchaseInvoiceItems).values({
          invoiceId: invoice.id,
          productId: item.productId,
          description: item.productName,
          quantity: String(item.quantity),
          unitPrice: item.unitPrice,
          taxPercent: "0",
          taxAmount: "0",
          totalAmount: lineTotal,
          sortOrder: i,
        });
      }
    });

    revalidatePath("/invoices");
    revalidatePath("/inventory");
    return { success: true, invoiceNumber };
  } catch (err) {
    if (err && typeof err === "object" && "userError" in err) {
      return { error: (err as Error).message };
    }
    console.error("[approveReorderPlan]", { taskId, error: String(err) });
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return { error: `Invoice number ${invoiceNumber} already exists. Please try again.` };
    }
    return { error: "Failed to create draft invoice. Please try again." };
  }
}

// ─── Dismiss Agent Task ───────────────────────────────────────────────────────

export async function dismissAgentTask(_prevState: unknown, formData: FormData) {
  const parsed = AgentTaskIdSchema.safeParse({ taskId: formData.get("taskId") });

  if (!parsed.success) {
    return { error: "Invalid task ID." };
  }

  const { taskId } = parsed.data;

  try {
    const result = await db
      .update(agentActions)
      .set({
        status: "dismissed",
        resolvedBy: CURRENT_USER_ID,
        resolvedAt: new Date(),
      })
      .where(eq(agentActions.id, taskId))
      .returning({ id: agentActions.id });

    if (result.length === 0) {
      return { error: "Task not found." };
    }
  } catch (err) {
    console.error("[dismissAgentTask]", { taskId, error: String(err) });
    return { error: "Failed to dismiss recommendation." };
  }

  revalidatePath("/inventory");
  return { success: true };
}
