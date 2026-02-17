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
import { adjustStock } from "@/app/products/actions";
import { useState } from "react";
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

        <form key={formKey} action={action} className="space-y-4">
          <input type="hidden" name="productId" value={productId} />

          <div className="space-y-2">
            <Label htmlFor="quantity">
              Quantity Adjustment
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              placeholder="e.g. +50 or -10"
              required
            />
            {state?.fieldErrors?.quantity && (
              <p className="text-sm text-destructive">
                {(state.fieldErrors.quantity as string[])?.[0]}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Positive = stock in, Negative = stock out
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="Reason for adjustment..."
            />
          </div>

          {state?.error && !state.fieldErrors && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

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
        </form>
      </DialogContent>
    </Dialog>
  );
}
