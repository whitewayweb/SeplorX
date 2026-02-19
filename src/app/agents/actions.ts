"use server";

import { db } from "@/db";
import {
  agentActions,
  purchaseInvoices,
  purchaseInvoiceItems,
  products,
  inventoryTransactions,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
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
    if (err instanceof Error && "userError" in err) {
      return { error: err.message };
    }
    console.error("[approveReorderPlan]", { taskId, error: String(err) });
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return { error: `Invoice number ${invoiceNumber} already exists. Please try again.` };
    }
    return { error: "Failed to create draft invoice. Please try again." };
  }
}

// ─── Approve OCR Invoice ──────────────────────────────────────────────────────
// User has reviewed the AI-extracted invoice, linked all products to existing
// catalog entries, and selected the correct supplier. This action atomically
// claims the agent_actions task and creates a real purchase invoice with stock update.

const OcrApprovalItemSchema = z.object({
  productId: z.coerce.number().int().positive("All items must be linked to a product"),
  description: z.string().trim().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  taxPercent: z.coerce.number().min(0).max(100),
});

const OcrApprovalSchema = z.object({
  taskId: z.coerce.number().int().positive(),
  companyId: z.coerce.number().int().positive("Please select a supplier"),
  invoiceNumber: z.string().trim().min(1, "Invoice number is required"),
  invoiceDate: z.string().trim().min(1, "Invoice date is required"),
  dueDate: z.string().trim().optional().or(z.literal("")),
  discountAmount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().optional().or(z.literal("")),
  items: z.array(OcrApprovalItemSchema).min(1, "At least one line item is required"),
});

// Helpers — duplicated inline from invoices/actions.ts (one use per CLAUDE.md principle)
function ocrRound2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function ocrComputeItemTotals(item: { quantity: number; unitPrice: number; taxPercent: number }) {
  const lineSubtotal = ocrRound2(item.quantity * item.unitPrice);
  const taxAmount = ocrRound2(lineSubtotal * (item.taxPercent / 100));
  const totalAmount = ocrRound2(lineSubtotal + taxAmount);
  return {
    taxAmount: taxAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
  };
}

function ocrComputeInvoiceTotals(
  items: Array<{ quantity: number; unitPrice: number; taxPercent: number }>,
  discountAmount: number,
) {
  let subtotal = 0;
  let taxTotal = 0;
  for (const item of items) {
    const lineSubtotal = ocrRound2(item.quantity * item.unitPrice);
    const lineTax = ocrRound2(lineSubtotal * (item.taxPercent / 100));
    subtotal = ocrRound2(subtotal + lineSubtotal);
    taxTotal = ocrRound2(taxTotal + lineTax);
  }
  const total = ocrRound2(subtotal + taxTotal - discountAmount);
  return {
    subtotal: subtotal.toFixed(2),
    taxAmount: taxTotal.toFixed(2),
    totalAmount: Math.max(0, total).toFixed(2),
  };
}

export async function approveOcrInvoice(_prevState: unknown, formData: FormData) {
  // 1. Parse line items from FormData (JSON-encoded array — same pattern as createInvoice)
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(formData.get("items") as string);
  } catch {
    return { error: "Invalid line items data." };
  }

  const parsed = OcrApprovalSchema.safeParse({
    taskId: formData.get("taskId"),
    companyId: formData.get("companyId"),
    invoiceNumber: formData.get("invoiceNumber"),
    invoiceDate: formData.get("invoiceDate"),
    dueDate: formData.get("dueDate"),
    discountAmount: formData.get("discountAmount"),
    notes: formData.get("notes"),
    items: rawItems,
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { taskId, companyId, items, discountAmount, dueDate, notes, ...headerData } = parsed.data;
  const totals = ocrComputeInvoiceTotals(items, discountAmount);

  try {
    await db.transaction(async (tx) => {
      // 2. Atomically claim the task — prevents double-approval
      const [claimed] = await tx
        .update(agentActions)
        .set({ status: "executed", resolvedBy: CURRENT_USER_ID, resolvedAt: new Date() })
        .where(and(eq(agentActions.id, taskId), eq(agentActions.status, "pending_approval")))
        .returning({ id: agentActions.id });

      if (!claimed) {
        throw Object.assign(new Error("This task has already been resolved."), { userError: true });
      }

      // 3. Insert purchase invoice — status "received" because the bill is in hand
      const noteText = notes
        ? `${notes}\n\nCreated via AI Invoice OCR.`
        : "Created via AI Invoice OCR.";

      const [invoice] = await tx
        .insert(purchaseInvoices)
        .values({
          invoiceNumber: headerData.invoiceNumber,
          companyId,
          invoiceDate: headerData.invoiceDate,
          dueDate: dueDate || null,
          status: "received",
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: String(discountAmount),
          totalAmount: totals.totalAmount,
          amountPaid: "0",
          notes: noteText,
          createdBy: CURRENT_USER_ID,
        })
        .returning({ id: purchaseInvoices.id });

      // 4. Insert line items + update stock (same logic as createInvoice for "received" status)
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemTotals = ocrComputeItemTotals(item);

        await tx.insert(purchaseInvoiceItems).values({
          invoiceId: invoice.id,
          productId: item.productId, // always non-null — validated by schema
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          taxPercent: String(item.taxPercent),
          taxAmount: itemTotals.taxAmount,
          totalAmount: itemTotals.totalAmount,
          sortOrder: i,
        });

        // Update stock — "received" invoice means goods have arrived
        const qty = Math.floor(item.quantity);
        if (qty > 0) {
          await tx
            .update(products)
            .set({
              quantityOnHand: sql`${products.quantityOnHand} + ${qty}`,
              updatedAt: new Date(),
            })
            .where(eq(products.id, item.productId));

          await tx.insert(inventoryTransactions).values({
            productId: item.productId,
            type: "purchase_in",
            quantity: qty,
            referenceType: "purchase_invoice",
            referenceId: invoice.id,
            notes: `Invoice #${headerData.invoiceNumber}`,
            createdBy: CURRENT_USER_ID,
          });
        }
      }
    });

    revalidatePath("/purchase/bills");
    revalidatePath("/invoices");
    revalidatePath("/inventory");
    revalidatePath("/products");
    return { success: true, invoiceNumber: parsed.data.invoiceNumber };
  } catch (err) {
    if (err instanceof Error && "userError" in err) {
      return { error: err.message };
    }
    console.error("[approveOcrInvoice]", { taskId, error: String(err) });
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return { error: "An invoice with this number already exists for this company." };
    }
    if (err && typeof err === "object" && "code" in err && err.code === "23503") {
      return { error: "Invalid company or product reference." };
    }
    return { error: "Failed to create purchase bill. Please try again." };
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
