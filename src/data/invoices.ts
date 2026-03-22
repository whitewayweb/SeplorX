import { db, type QueryClient } from "@/db";
import { purchaseInvoices, purchaseInvoiceItems, payments, companies, products } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export async function getInvoicesList(userId: number, tx: QueryClient = db) {
  return await tx
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
    .orderBy(desc(purchaseInvoices.createdAt));
}

export async function getInvoiceDetails(invoiceId: number, tx: QueryClient = db) {
  const result = await tx
    .select({
      id: purchaseInvoices.id,
      invoiceNumber: purchaseInvoices.invoiceNumber,
      companyId: purchaseInvoices.companyId,
      invoiceDate: purchaseInvoices.invoiceDate,
      dueDate: purchaseInvoices.dueDate,
      status: purchaseInvoices.status,
      subtotal: purchaseInvoices.subtotal,
      taxAmount: purchaseInvoices.taxAmount,
      discountAmount: purchaseInvoices.discountAmount,
      totalAmount: purchaseInvoices.totalAmount,
      amountPaid: purchaseInvoices.amountPaid,
      notes: purchaseInvoices.notes,
      createdAt: purchaseInvoices.createdAt,
      companyName: companies.name,
    })
    .from(purchaseInvoices)
    .innerJoin(companies, eq(purchaseInvoices.companyId, companies.id))
    .where(eq(purchaseInvoices.id, invoiceId))
    .limit(1);
    
  return result[0];
}

export async function getInvoiceLineItems(invoiceId: number, tx: QueryClient = db) {
  return await tx
    .select({
      id: purchaseInvoiceItems.id,
      productId: purchaseInvoiceItems.productId,
      description: purchaseInvoiceItems.description,
      quantity: purchaseInvoiceItems.quantity,
      unitPrice: purchaseInvoiceItems.unitPrice,
      taxPercent: purchaseInvoiceItems.taxPercent,
      taxAmount: purchaseInvoiceItems.taxAmount,
      totalAmount: purchaseInvoiceItems.totalAmount,
      sortOrder: purchaseInvoiceItems.sortOrder,
      productName: products.name,
    })
    .from(purchaseInvoiceItems)
    .leftJoin(products, eq(purchaseInvoiceItems.productId, products.id))
    .where(eq(purchaseInvoiceItems.invoiceId, invoiceId))
    .orderBy(purchaseInvoiceItems.sortOrder);
}

export async function getInvoicePayments(invoiceId: number, tx: QueryClient = db) {
  return await tx
    .select({
      id: payments.id,
      amount: payments.amount,
      paymentDate: payments.paymentDate,
      paymentMode: payments.paymentMode,
      reference: payments.reference,
      notes: payments.notes,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
    .orderBy(desc(payments.createdAt));
}

export async function getExistingInvoicesForDuplicateCheck(invoiceNumbers: string[], userId: number, tx: QueryClient = db) {
  return await tx
    .select({
      invoiceDate: purchaseInvoices.invoiceDate,
      totalAmount: purchaseInvoices.totalAmount,
      invoiceNumber: purchaseInvoices.invoiceNumber,
      companyId: purchaseInvoices.companyId
    })
    .from(purchaseInvoices)
    .where(
      and(
        inArray(purchaseInvoices.invoiceNumber, invoiceNumbers),
        eq(purchaseInvoices.createdBy, userId)
      )
    );
}
