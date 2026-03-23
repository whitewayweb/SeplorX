"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RotateCcw } from "lucide-react";
import { processReturnAction } from "@/app/(dashboard)/orders/actions";

interface ReturnItem {
  id: number;
  title: string | null;
  sku: string | null;
  quantity: number;
  returnQuantity: number;
  returnDisposition: string | null;
  productId: number | null;
}

interface ReturnActionDialogProps {
  item: ReturnItem;
}

export function ReturnActionDialog({ item }: ReturnActionDialogProps) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"restock" | "discard">("restock");
  const maxReturnable = item.quantity - item.returnQuantity;
  const [quantity, setQuantity] = useState(maxReturnable);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const isFullyProcessed = item.returnDisposition === "restocked" || item.returnDisposition === "discarded";

  if (!item.productId || isFullyProcessed || maxReturnable <= 0) {
    return null;
  }

  function handleSubmit() {
    if (quantity <= 0 || quantity > maxReturnable) {
      toast.error("Invalid quantity", {
        description: `Quantity must be between 1 and ${maxReturnable}.`,
      });
      return;
    }

    startTransition(async () => {
      const result = await processReturnAction({
        orderItemId: item.id,
        action,
        quantity,
        notes: notes.trim() || undefined,
      });

      if (result.success) {
        toast.success(
          action === "restock" ? "Items Restocked" : "Items Discarded",
          {
            description: `${quantity} unit(s) ${action === "restock" ? "added back to inventory" : "marked as discarded"}.`,
          },
        );
        setOpen(false);
        setNotes("");
      } else {
        toast.error("Return processing failed", {
          description: result.error ?? "Something went wrong.",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <RotateCcw className="h-3 w-3" />
          Process Return
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Process Return</DialogTitle>
          <DialogDescription>
            {item.title ?? "Unknown product"}{" "}
            {item.sku && <span className="font-mono text-xs">({item.sku})</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Action selector */}
          <div className="space-y-2">
            <Label>Action</Label>
            <Select
              value={action}
              onValueChange={(v) => setAction(v as "restock" | "discard")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="restock">
                  Restock — Add back to inventory
                </SelectItem>
                <SelectItem value="discard">
                  Discard — Do not restock (damaged/defective)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quantity picker */}
          <div className="space-y-2">
            <Label>
              Quantity{" "}
              <span className="text-muted-foreground text-xs font-normal">
                (max {maxReturnable})
              </span>
            </Label>
            <Input
              type="number"
              min={1}
              max={maxReturnable}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>
              Notes{" "}
              <span className="text-muted-foreground text-xs font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              placeholder="e.g. Product in good condition, resealed"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || quantity <= 0}
            variant={action === "discard" ? "destructive" : "default"}
          >
            {pending
              ? "Processing…"
              : action === "restock"
                ? `Restock ${quantity} unit(s)`
                : `Discard ${quantity} unit(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
