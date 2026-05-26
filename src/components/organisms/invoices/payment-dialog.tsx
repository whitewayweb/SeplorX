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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addPayment } from "@/app/(dashboard)/invoices/actions";
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

        <form key={formKey} action={action}>
          <input type="hidden" name="invoiceId" value={invoiceId} />

          <FieldGroup className="gap-4">
          <Field data-invalid={Boolean(state?.fieldErrors?.amount)}>
            <FieldLabel htmlFor="amount">
              Amount (₹) <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={remainingBalance}
              defaultValue={remainingBalance.toFixed(2)}
              required
              aria-invalid={Boolean(state?.fieldErrors?.amount)}
            />
            <FieldError>{(state?.fieldErrors?.amount as string[] | undefined)?.[0]}</FieldError>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="paymentDate">
                Date <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="paymentDate"
                name="paymentDate"
                type="date"
                defaultValue={today}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="paymentMode">
                Mode <span className="text-destructive">*</span>
              </FieldLabel>
              <Select name="paymentMode" defaultValue="bank_transfer">
                <SelectTrigger id="paymentMode">
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
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="reference">Reference (UTR / Cheque No.)</FieldLabel>
            <Input id="reference" name="reference" placeholder="Transaction reference..." />
          </Field>

          <Field>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Textarea id="notes" name="notes" rows={2} placeholder="Payment notes..." />
          </Field>

          {state?.error && !state.fieldErrors && <FieldError>{state.error}</FieldError>}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
