"use client";

import { useActionState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateInvoice } from "@/app/invoices/actions";
import { useState } from "react";
import { Pencil } from "lucide-react";

type Invoice = {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  discountAmount: string;
  notes: string | null;
};

interface InvoiceEditDialogProps {
  invoice: Invoice;
}

export function InvoiceEditDialog({ invoice }: InvoiceEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const [state, action, pending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = await updateInvoice(prev, formData);

      if (result?.success) {
        setOpen(false);
        setFormKey((k) => k + 1);
      }

      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Invoice</DialogTitle>
          <DialogDescription>
            Update invoice header details.
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={action} className="space-y-4">
          <input type="hidden" name="id" value={invoice.id} />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">
                Invoice Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="invoiceNumber"
                name="invoiceNumber"
                defaultValue={invoice.invoiceNumber}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={invoice.status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">
                Invoice Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="invoiceDate"
                name="invoiceDate"
                type="date"
                defaultValue={invoice.invoiceDate}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                defaultValue={invoice.dueDate ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discountAmount">Discount (₹)</Label>
            <Input
              id="discountAmount"
              name="discountAmount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={invoice.discountAmount}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={invoice.notes ?? ""}
              placeholder="Invoice notes..."
            />
          </div>

          {state?.error && !state.fieldErrors && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
