import { db } from "@/db";
import {
  purchaseInvoices,
  purchaseInvoiceItems,
  payments,
  companies,
  products,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Calendar, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentDialog } from "@/components/invoices/payment-dialog";
import { DeletePaymentButton } from "@/components/invoices/delete-payment-button";
import { InvoiceEditDialog } from "@/components/invoices/invoice-edit-dialog";

export const dynamic = "force-dynamic";

interface InvoiceDetailPageProps {
  params: Promise<{ id: string }>;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "outline" },
  received: { label: "Received", variant: "secondary" },
  partial: { label: "Partial", variant: "default" },
  paid: { label: "Paid", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  upi: "UPI",
  cheque: "Cheque",
  other: "Other",
};

function formatCurrency(value: string | null): string {
  if (!value) return "₹0.00";
  const num = parseFloat(value);
  return isNaN(num) ? "₹0.00" : `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function formatDate(value: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const { id } = await params;
  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    notFound();
  }

  // Fetch invoice with company name
  const result = await db
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

  if (result.length === 0) {
    notFound();
  }

  const invoice = result[0];

  // Fetch line items with optional product name
  const items = await db
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

  // Fetch payments
  const paymentList = await db
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

  const statusConfig = STATUS_CONFIG[invoice.status] ?? { label: invoice.status, variant: "outline" as const };
  const remainingBalance = parseFloat(invoice.totalAmount) - parseFloat(invoice.amountPaid);
  const canAddPayment = invoice.status !== "cancelled" && invoice.status !== "paid" && remainingBalance > 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                #{invoice.invoiceNumber}
              </h1>
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {invoice.companyName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <InvoiceEditDialog invoice={{
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            status: invoice.status,
            discountAmount: invoice.discountAmount,
            notes: invoice.notes,
          }} />
          {canAddPayment && (
            <PaymentDialog invoiceId={invoice.id} remainingBalance={remainingBalance} />
          )}
        </div>
      </div>

      {/* Invoice Details */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Supplier</p>
                <Link href={`/companies/${invoice.companyId}`} className="text-sm font-medium hover:underline">
                  {invoice.companyName}
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Invoice Number</p>
                <p className="text-sm font-mono">{invoice.invoiceNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Date</p>
                  <p className="text-sm">{formatDate(invoice.invoiceDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="text-sm">{formatDate(invoice.dueDate)}</p>
                </div>
              </div>
            </div>
            {invoice.notes && (
              <div>
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm whitespace-pre-wrap mt-1">{invoice.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatCurrency(invoice.taxAmount)}</span>
            </div>
            {parseFloat(invoice.discountAmount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-red-600">-{formatCurrency(invoice.discountAmount)}</span>
              </div>
            )}
            <div className="border-t pt-3 flex justify-between font-medium">
              <span>Total</span>
              <span>{formatCurrency(invoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Paid</span>
              <span className="text-green-600">{formatCurrency(invoice.amountPaid)}</span>
            </div>
            {remainingBalance > 0 && (
              <div className="flex justify-between text-sm font-medium">
                <span className="text-muted-foreground">Balance Due</span>
                <span className="text-amber-600">{formatCurrency(remainingBalance.toFixed(2))}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Tax %</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, i) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{item.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.productName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell className="text-right font-mono">{item.taxPercent}%</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.taxAmount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(item.totalAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Payments</CardTitle>
          {canAddPayment && (
            <PaymentDialog invoiceId={invoice.id} remainingBalance={remainingBalance} />
          )}
        </CardHeader>
        <CardContent>
          {paymentList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No payments recorded yet.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentList.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-sm">{formatDate(payment.paymentDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {PAYMENT_MODE_LABELS[payment.paymentMode] ?? payment.paymentMode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {payment.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                        {payment.notes ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DeletePaymentButton paymentId={payment.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
