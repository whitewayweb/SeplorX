"use server";

import { db } from "@/db";
import {
  purchaseInvoices,
  purchaseInvoiceItems,
  payments,
  products,
  inventoryTransactions,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  CreateInvoiceSchema,
  UpdateInvoiceSchema,
  InvoiceIdSchema,
  AddPaymentSchema,
  PaymentIdSchema,
} from "@/lib/validations/invoices";
import type { LineItemInput } from "@/lib/validations/invoices";

// TODO: replace with auth() when auth is re-added
const CURRENT_USER_ID = 1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeItemTotals(item: LineItemInput) {
  const lineSubtotal = item.quantity * item.unitPrice;
  const taxAmount = lineSubtotal * (item.taxPercent / 100);
  const totalAmount = lineSubtotal + taxAmount;
  return {
    taxAmount: taxAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
  };
}

function computeInvoiceTotals(
  items: LineItemInput[],
  discountAmount: number,
) {
  let subtotal = 0;
  let taxTotal = 0;
  for (const item of items) {
    const lineSubtotal = item.quantity * item.unitPrice;
    const lineTax = lineSubtotal * (item.taxPercent / 100);
    subtotal += lineSubtotal;
    taxTotal += lineTax;
  }
  const total = subtotal + taxTotal - discountAmount;
  return {
    subtotal: subtotal.toFixed(2),
    taxAmount: taxTotal.toFixed(2),
    totalAmount: Math.max(0, total).toFixed(2),
  };
}

// ─── Create Invoice ──────────────────────────────────────────────────────────

export async function createInvoice(_prevState: unknown, formData: FormData) {
  // Parse line items from FormData (JSON-encoded array)
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(formData.get("items") as string);
  } catch {
    return { error: "Invalid line items data." };
  }

  const parsed = CreateInvoiceSchema.safeParse({
    invoiceNumber: formData.get("invoiceNumber"),
    companyId: formData.get("companyId"),
    invoiceDate: formData.get("invoiceDate"),
    dueDate: formData.get("dueDate"),
    status: formData.get("status"),
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

  const { items, discountAmount, dueDate, notes, ...invoiceData } = parsed.data;
  const totals = computeInvoiceTotals(items, discountAmount);

  try {
    await db.transaction(async (tx) => {
      // 1. Insert the invoice
      const [invoice] = await tx
        .insert(purchaseInvoices)
        .values({
          ...invoiceData,
          dueDate: dueDate || null,
          notes: notes || null,
          discountAmount: String(discountAmount),
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          amountPaid: "0",
          createdBy: CURRENT_USER_ID,
        })
        .returning({ id: purchaseInvoices.id });

      // 2. Insert line items
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemTotals = computeItemTotals(item);

        await tx.insert(purchaseInvoiceItems).values({
          invoiceId: invoice.id,
          productId: item.productId,
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          taxPercent: String(item.taxPercent),
          taxAmount: itemTotals.taxAmount,
          totalAmount: itemTotals.totalAmount,
          sortOrder: i,
        });

        // 3. If line item references a product and invoice is not draft, update stock
        if (item.productId !== null && invoiceData.status !== "draft") {
          const qty = Math.floor(item.quantity); // stock is integer
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
              notes: `Invoice #${invoiceData.invoiceNumber}`,
              createdBy: CURRENT_USER_ID,
            });
          }
        }
      }
    });
  } catch (err) {
    console.error("[createInvoice]", { error: String(err) });
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "23505"
    ) {
      return { error: "An invoice with this number already exists for this company." };
    }
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "23503"
    ) {
      return { error: "Invalid company or product reference." };
    }
    return { error: "Failed to create invoice. Please try again." };
  }

  revalidatePath("/invoices");
  revalidatePath("/inventory");
  revalidatePath("/products");
  return { success: true };
}

// ─── Update Invoice (header only, no line item changes) ──────────────────────

export async function updateInvoice(_prevState: unknown, formData: FormData) {
  const parsed = UpdateInvoiceSchema.safeParse({
    id: formData.get("id"),
    invoiceNumber: formData.get("invoiceNumber"),
    invoiceDate: formData.get("invoiceDate"),
    dueDate: formData.get("dueDate"),
    status: formData.get("status"),
    discountAmount: formData.get("discountAmount"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, dueDate, notes, discountAmount, ...data } = parsed.data;

  try {
    const existing = await db
      .select({ id: purchaseInvoices.id, subtotal: purchaseInvoices.subtotal, taxAmount: purchaseInvoices.taxAmount })
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.id, id))
      .limit(1);

    if (existing.length === 0) {
      return { error: "Invoice not found." };
    }

    // Recalculate total with new discount
    const subtotal = parseFloat(existing[0].subtotal);
    const taxAmount = parseFloat(existing[0].taxAmount);
    const newTotal = Math.max(0, subtotal + taxAmount - discountAmount);

    await db
      .update(purchaseInvoices)
      .set({
        ...data,
        dueDate: dueDate || null,
        notes: notes || null,
        discountAmount: String(discountAmount),
        totalAmount: newTotal.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(purchaseInvoices.id, id));
  } catch (err) {
    console.error("[updateInvoice]", { invoiceId: id, error: String(err) });
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "23505"
    ) {
      return { error: "An invoice with this number already exists for this company." };
    }
    return { error: "Failed to update invoice. Please try again." };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { success: true };
}

// ─── Delete Invoice ──────────────────────────────────────────────────────────

export async function deleteInvoice(_prevState: unknown, formData: FormData) {
  const parsed = InvoiceIdSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { error: "Invalid invoice ID." };
  }

  const { id } = parsed.data;

  try {
    const existing = await db
      .select({ id: purchaseInvoices.id })
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.id, id))
      .limit(1);

    if (existing.length === 0) {
      return { error: "Invoice not found." };
    }

    // Line items cascade-delete, but payments FK blocks deletion
    await db.delete(purchaseInvoices).where(eq(purchaseInvoices.id, id));
  } catch (err) {
    console.error("[deleteInvoice]", { invoiceId: id, error: String(err) });
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "23503"
    ) {
      return { error: "Cannot delete invoice with existing payments. Cancel it instead." };
    }
    return { error: "Failed to delete invoice. Please try again." };
  }

  revalidatePath("/invoices");
  return { success: true };
}

// ─── Add Payment ─────────────────────────────────────────────────────────────

export async function addPayment(_prevState: unknown, formData: FormData) {
  const parsed = AddPaymentSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    amount: formData.get("amount"),
    paymentDate: formData.get("paymentDate"),
    paymentMode: formData.get("paymentMode"),
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { invoiceId, amount, paymentDate, paymentMode, reference, notes } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      // 1. Get current invoice state
      const [invoice] = await tx
        .select({
          id: purchaseInvoices.id,
          totalAmount: purchaseInvoices.totalAmount,
          amountPaid: purchaseInvoices.amountPaid,
          status: purchaseInvoices.status,
        })
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, invoiceId))
        .limit(1);

      if (!invoice) {
        throw new Error("INVOICE_NOT_FOUND");
      }

      if (invoice.status === "cancelled") {
        throw new Error("INVOICE_CANCELLED");
      }

      const totalAmount = parseFloat(invoice.totalAmount);
      const currentPaid = parseFloat(invoice.amountPaid);
      const newPaid = currentPaid + amount;

      if (newPaid > totalAmount) {
        throw new Error(`OVERPAYMENT:${totalAmount}:${currentPaid}`);
      }

      // 2. Insert payment
      await tx.insert(payments).values({
        invoiceId,
        amount: String(amount),
        paymentDate,
        paymentMode,
        reference: reference || null,
        notes: notes || null,
        createdBy: CURRENT_USER_ID,
      });

      // 3. Atomically update amount_paid and auto-set status
      const newStatus = newPaid >= totalAmount ? "paid" : "partial";

      await tx
        .update(purchaseInvoices)
        .set({
          amountPaid: sql`${purchaseInvoices.amountPaid}::numeric + ${String(amount)}::numeric`,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(purchaseInvoices.id, invoiceId));
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("INVOICE_NOT_FOUND")) {
      return { error: "Invoice not found." };
    }
    if (message.includes("INVOICE_CANCELLED")) {
      return { error: "Cannot add payment to a cancelled invoice." };
    }
    if (message.includes("OVERPAYMENT:")) {
      const parts = message.split("OVERPAYMENT:")[1].split(":");
      return { error: `Payment exceeds remaining balance. Total: ₹${parts[0]}, already paid: ₹${parts[1]}.` };
    }
    console.error("[addPayment]", { invoiceId, amount, error: message });
    return { error: "Failed to record payment. Please try again." };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true };
}

// ─── Delete Payment ──────────────────────────────────────────────────────────

export async function deletePayment(_prevState: unknown, formData: FormData) {
  const parsed = PaymentIdSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { error: "Invalid payment ID." };
  }

  const { id } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      // 1. Get payment details
      const [payment] = await tx
        .select({
          id: payments.id,
          invoiceId: payments.invoiceId,
          amount: payments.amount,
        })
        .from(payments)
        .where(eq(payments.id, id))
        .limit(1);

      if (!payment) {
        throw new Error("PAYMENT_NOT_FOUND");
      }

      // 2. Delete payment
      await tx.delete(payments).where(eq(payments.id, id));

      // 3. Update invoice amount_paid and status
      const [invoice] = await tx
        .select({
          totalAmount: purchaseInvoices.totalAmount,
          amountPaid: purchaseInvoices.amountPaid,
        })
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, payment.invoiceId))
        .limit(1);

      if (invoice) {
        const newPaid = parseFloat(invoice.amountPaid) - parseFloat(payment.amount);
        const totalAmount = parseFloat(invoice.totalAmount);
        let newStatus: "received" | "partial" | "paid";
        if (newPaid <= 0) {
          newStatus = "received";
        } else if (newPaid >= totalAmount) {
          newStatus = "paid";
        } else {
          newStatus = "partial";
        }

        await tx
          .update(purchaseInvoices)
          .set({
            amountPaid: sql`${purchaseInvoices.amountPaid}::numeric - ${payment.amount}::numeric`,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(purchaseInvoices.id, payment.invoiceId));
      }
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("PAYMENT_NOT_FOUND")) {
      return { error: "Payment not found." };
    }
    console.error("[deletePayment]", { paymentId: id, error: message });
    return { error: "Failed to delete payment. Please try again." };
  }

  revalidatePath("/invoices");
  return { success: true };
}
