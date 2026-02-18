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
import { addPayment } from "@/app/invoices/actions";
import { useState } from "react";
import { CreditCard } from "lucide-react";

interface PaymentDialogProps {
  invoiceId: number;
  remainingBalance: number;
}

const PAYMENT_MODES = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
] as const;

export function PaymentDialog({ invoiceId, remainingBalance }: PaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const [state, action, pending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = await addPayment(prev, formData);

      if (result?.success) {
        setOpen(false);
        setFormKey((k) => k + 1);
      }

      return result;
    },
    null,
  );

  const today = new Date().toISOString().split("T")[0];
  const formattedBalance = `₹${remainingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CreditCard className="h-4 w-4 mr-2" />
          Add Payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Remaining balance: <span className="font-medium">{formattedBalance}</span>
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={action} className="space-y-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />

          <div className="space-y-2">
            <Label htmlFor="amount">
              Amount (₹) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={remainingBalance}
              defaultValue={remainingBalance.toFixed(2)}
              required
            />
            {state?.fieldErrors?.amount && (
              <p className="text-sm text-destructive">
                {(state.fieldErrors.amount as string[])?.[0]}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentDate">
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="paymentDate"
                name="paymentDate"
                type="date"
                defaultValue={today}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMode">
                Mode <span className="text-destructive">*</span>
              </Label>
              <Select name="paymentMode" defaultValue="bank_transfer">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference">Reference (UTR / Cheque No.)</Label>
            <Input id="reference" name="reference" placeholder="Transaction reference..." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Payment notes..." />
          </div>

          {state?.error && !state.fieldErrors && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
