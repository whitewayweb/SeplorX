"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { adjustStock } from "@/app/(dashboard)/products/actions";
import { PackagePlus } from "lucide-react";

interface StockAdjustmentDialogProps {
  productId: number;
  productName: string;
}

export function StockAdjustmentDialog({ productId, productName }: StockAdjustmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const [state, action, pending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = await adjustStock(prev, formData);

      if (result?.success) {
        toast.success("Stock adjusted successfully");
        setOpen(false);
        setFormKey((k) => k + 1);
      } else if (result?.error) {
        toast.error(result.error);
      }
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Adjust stock">
          <PackagePlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>
            Adjust inventory for <span className="font-medium">{productName}</span>.
            Use positive numbers to add stock and negative to remove.
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={action}>
          <input type="hidden" name="productId" value={productId} />

          <FieldGroup className="gap-4">
          <Field data-invalid={Boolean(state?.fieldErrors?.quantity)}>
            <FieldLabel htmlFor="quantity">
              Quantity Adjustment
              <span className="text-destructive ml-1">*</span>
            </FieldLabel>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              placeholder="e.g. +50 or -10"
              required
              aria-invalid={Boolean(state?.fieldErrors?.quantity)}
            />
            <FieldError>{(state?.fieldErrors?.quantity as string[] | undefined)?.[0]}</FieldError>
            <FieldDescription className="text-xs">
              Positive = stock in, Negative = stock out
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="Reason for adjustment..."
            />
          </Field>

          {state?.error && !state.fieldErrors && <FieldError>{state.error}</FieldError>}

          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adjusting..." : "Adjust Stock"}
            </Button>
          </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
