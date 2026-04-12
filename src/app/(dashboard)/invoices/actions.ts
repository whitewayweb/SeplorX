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
import {
  getInvoiceDetails,
  getInvoiceLineItems,
} from "@/data/invoices";
import { getAuthenticatedUserId } from "@/lib/auth";
import { triggerChannelSync } from "@/lib/stock/service";


// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Round to 2 decimal places using banker's rounding to avoid floating point drift */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeItemTotals(item: LineItemInput) {
  const lineSubtotal = round2(item.quantity * item.unitPrice);
  const taxAmount = round2(lineSubtotal * (item.taxPercent / 100));
  const totalAmount = round2(lineSubtotal + taxAmount);
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
    const lineSubtotal = round2(item.quantity * item.unitPrice);
    const lineTax = round2(lineSubtotal * (item.taxPercent / 100));
    subtotal = round2(subtotal + lineSubtotal);
    taxTotal = round2(taxTotal + lineTax);
  }
  const total = round2(subtotal + taxTotal - discountAmount);
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
    const userId = await getAuthenticatedUserId();
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
          createdBy: userId,
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
      }

      // 3. Aggregate by product for stock updates and ledger entries (if not draft)
      if (invoiceData.status !== "draft") {
        const productTotals = new Map<number, number>();
        for (const item of items) {
          if (!item.productId || item.quantity <= 0) continue;
          const qty = Math.floor(item.quantity);
          if (qty > 0) {
            productTotals.set(item.productId, (productTotals.get(item.productId) || 0) + qty);
          }
        }

        for (const [productId, quantity] of productTotals.entries()) {
          await tx
            .update(products)
            .set({
              quantityOnHand: sql`${products.quantityOnHand} + ${quantity}`,
              updatedAt: new Date(),
            })
            .where(eq(products.id, productId));

          await tx.insert(inventoryTransactions).values({
            productId,
            type: "purchase_in",
            quantity,
            referenceType: "purchase_invoice",
            referenceId: invoice.id,
            notes: `Invoice #${invoiceData.invoiceNumber}`,
            createdBy: userId,
          });

          // Trigger sync since stock increased
          await triggerChannelSync(productId, tx);
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

export async function updateInvoice(_prevState: unknown, formData: FormData) {
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(formData.get("items") as string);
  } catch {
    return { error: "Invalid line items data." };
  }

  const parsed = UpdateInvoiceSchema.safeParse({
    id: formData.get("id"),
    invoiceNumber: formData.get("invoiceNumber"),
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

  const { id, items, discountAmount, dueDate, notes, ...invoiceData } = parsed.data;
  const newTotals = computeInvoiceTotals(items, discountAmount);

  try {
    const userId = await getAuthenticatedUserId();
    await db.transaction(async (tx) => {
      // 1. Get old items for delta calculation
      const oldItems = await getInvoiceLineItems(id, tx);
      const oldInvoice = await getInvoiceDetails(id, tx);
      
      if (!oldInvoice) throw new Error("INVOICE_NOT_FOUND");

      // 2. Calculate Delta per Product
      const productDelta = new Map<number, number>();
      
      const applyImpact = (pId: number, qty: number, mult: number) => 
        productDelta.set(pId, (productDelta.get(pId) || 0) + (qty * mult));

      if (oldInvoice.status !== "draft" && oldInvoice.status !== "cancelled")
        oldItems.forEach(i => i.productId && applyImpact(i.productId, Math.floor(parseFloat(i.quantity)), -1));

      if (invoiceData.status !== "draft" && invoiceData.status !== "cancelled")
        items.forEach(i => i.productId && applyImpact(i.productId, Math.floor(i.quantity), 1));

      // 3. Apply deltas
      for (const [productId, delta] of productDelta.entries()) {
        if (delta === 0) continue;
        await tx.update(products).set({ quantityOnHand: sql`${products.quantityOnHand} + ${delta}`, updatedAt: new Date() }).where(eq(products.id, productId));
        await tx.insert(inventoryTransactions).values({ productId, type: "adjustment", quantity: delta, referenceType: "purchase_invoice", referenceId: id, createdBy: userId, notes: `Updated Invoice #${invoiceData.invoiceNumber}` });
        await triggerChannelSync(productId, tx);
      }

      // 4. Replace line items
      await tx.delete(purchaseInvoiceItems).where(eq(purchaseInvoiceItems.invoiceId, id));
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemTotals = computeItemTotals(item);

        await tx.insert(purchaseInvoiceItems).values({
          invoiceId: id,
          productId: item.productId,
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          taxPercent: String(item.taxPercent),
          taxAmount: itemTotals.taxAmount,
          totalAmount: itemTotals.totalAmount,
          sortOrder: i,
        });
      }

      // 5. Update header
      await tx
        .update(purchaseInvoices)
        .set({
          ...invoiceData,
          dueDate: dueDate || null,
          notes: notes || null,
          discountAmount: String(discountAmount),
          subtotal: newTotals.subtotal,
          taxAmount: newTotals.taxAmount,
          totalAmount: newTotals.totalAmount,
          updatedAt: new Date(),
        })
        .where(eq(purchaseInvoices.id, id));
    });
  } catch (err) {
    console.error("[updateInvoice]", { invoiceId: id, error: String(err) });
    if (err instanceof Error && err.message === "INVOICE_NOT_FOUND") return { error: "Invoice not found." };
    return { error: "Failed to update invoice. Please try again." };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/inventory");
  revalidatePath("/products");
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
    await db.transaction(async (tx) => {
      // 1. Get invoice header to check status and company
      const invoice = await getInvoiceDetails(id, tx);

      if (!invoice) throw new Error("INVOICE_NOT_FOUND");

      // 2. Check for existing payments
      const [existingPayment] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.invoiceId, id))
        .limit(1);

      if (existingPayment) {
        throw new Error("PAYMENT_BLOCK");
      }

      // 3. If the invoice was Received/Partial/Paid, we must reverse the stock impact
      if (invoice.status !== "draft" && invoice.status !== "cancelled") {
        const userId = await getAuthenticatedUserId();
        const items = await getInvoiceLineItems(id, tx);
        const productTotals = new Map<number, number>();

        for (const item of items) {
          if (item.productId) {
            const qty = Math.floor(parseFloat(item.quantity));
            if (qty > 0) {
              productTotals.set(item.productId, (productTotals.get(item.productId) || 0) + qty);
            }
          }
        }

        // 4. Reverse stock and log audit trail
        for (const [productId, quantity] of productTotals.entries()) {
          // Decrement stock
          await tx
            .update(products)
            .set({
              quantityOnHand: sql`GREATEST(0, ${products.quantityOnHand} - ${quantity})`,
              updatedAt: new Date(),
            })
            .where(eq(products.id, productId));

          // Insert audit-safe reversal transaction
          await tx.insert(inventoryTransactions).values({
            productId,
            type: "adjustment",
            quantity: -quantity, // Negative = stock removed
            referenceType: "purchase_invoice",
            referenceId: id,
            notes: `Reversal: Purchase Invoice #${invoice.invoiceNumber} deleted`,
            createdBy: userId,
          });

          // Trigger sync since stock decreased
          await triggerChannelSync(productId, tx);
        }
      }

      // 5. Finally delete the invoice (items cascade delete)
      await tx.delete(purchaseInvoices).where(eq(purchaseInvoices.id, id));
    });
  } catch (err) {
    console.error("[deleteInvoice]", { invoiceId: id, error: String(err) });
    if (err instanceof Error && err.message === "INVOICE_NOT_FOUND") return { error: "Invoice not found." };
    if (err instanceof Error && err.message === "PAYMENT_BLOCK") {
      return { error: "Cannot delete invoice with existing payments. Please delete all related payments first." };
    }
    
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "23503"
    ) {
      return { error: "Cannot delete invoice with existing payments. Please delete all related payments first." };
    }
    return { error: "Failed to delete invoice. Please try again." };
  }

  revalidatePath("/invoices");
  revalidatePath("/inventory");
  revalidatePath("/products");
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
    const userId = await getAuthenticatedUserId();
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
        createdBy: userId,
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
