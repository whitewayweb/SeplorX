"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteInvoice } from "@/app/invoices/actions";
import { Eye, Trash2 } from "lucide-react";

type Invoice = {
  id: number;
  invoiceNumber: string;
  companyId: number;
  invoiceDate: string;
  dueDate: string | null;
  status: "draft" | "received" | "partial" | "paid" | "cancelled";
  totalAmount: string;
  amountPaid: string;
  companyName: string;
};

interface InvoiceListProps {
  invoices: Invoice[];
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "outline" },
  received: { label: "Received", variant: "secondary" },
  partial: { label: "Partial", variant: "default" },
  paid: { label: "Paid", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

function formatCurrency(value: string): string {
  const num = parseFloat(value);
  return isNaN(num) ? "₹0.00" : `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function DeleteButton({ invoice }: { invoice: Invoice }) {
  const [state, action, pending] = useActionState(deleteInvoice, null);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={invoice.id} />
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        disabled={pending}
        title="Delete invoice"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      {state?.error && (
        <span className="text-xs text-destructive">{state.error}</span>
      )}
    </form>
  );
}

export function InvoiceList({ invoices }: InvoiceListProps) {
  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-lg">No invoices yet</p>
        <p className="text-muted-foreground text-sm mt-1">
          Create your first purchase invoice to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice #</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => {
            const statusConfig = STATUS_CONFIG[inv.status] ?? { label: inv.status, variant: "outline" as const };
            return (
              <TableRow key={inv.id}>
                <TableCell className="font-mono font-medium">{inv.invoiceNumber}</TableCell>
                <TableCell>
                  <Link href={`/companies/${inv.companyId}`} className="hover:underline">
                    {inv.companyName}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{formatDate(inv.invoiceDate)}</TableCell>
                <TableCell className="text-sm">{formatDate(inv.dueDate)}</TableCell>
                <TableCell>
                  <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                </TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(inv.totalAmount)}</TableCell>
                <TableCell className="text-right text-green-600">{formatCurrency(inv.amountPaid)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/invoices/${inv.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <DeleteButton invoice={inv} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
