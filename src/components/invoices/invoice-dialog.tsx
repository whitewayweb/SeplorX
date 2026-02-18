"use client";

import { useActionState, useState, useCallback } from "react";
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
import { createInvoice } from "@/app/invoices/actions";
import { Plus, Trash2 } from "lucide-react";

type Company = { id: number; name: string };
type Product = {
  id: number;
  name: string;
  sku: string | null;
  purchasePrice: string | null;
  unit: string;
};

interface InvoiceDialogProps {
  companies: Company[];
  products: Product[];
}

type LineItem = {
  key: number;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxPercent: string;
};

function emptyItem(key: number): LineItem {
  return { key, productId: "", description: "", quantity: "1", unitPrice: "0", taxPercent: "0" };
}

export function InvoiceDialog({ companies, products }: InvoiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [items, setItems] = useState<LineItem[]>([emptyItem(0)]);
  const [nextKey, setNextKey] = useState(1);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, emptyItem(nextKey)]);
    setNextKey((k) => k + 1);
  }, [nextKey]);

  const removeItem = useCallback((key: number) => {
    setItems((prev) => prev.length > 1 ? prev.filter((i) => i.key !== key) : prev);
  }, []);

  const updateItem = useCallback((key: number, field: keyof LineItem, value: string) => {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)),
    );
  }, []);

  const handleProductSelect = useCallback((key: number, productId: string) => {
    const product = products.find((p) => String(p.id) === productId);
    if (product) {
      setItems((prev) =>
        prev.map((i) =>
          i.key === key
            ? {
                ...i,
                productId,
                description: product.name,
                unitPrice: product.purchasePrice ?? "0",
              }
            : i,
        ),
      );
    } else {
      updateItem(key, "productId", productId);
    }
  }, [products, updateItem]);

  const [state, action, pending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      // Serialize line items as JSON into FormData
      const itemsData = items.map((item) => ({
        productId: item.productId || "",
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxPercent: item.taxPercent,
      }));
      formData.set("items", JSON.stringify(itemsData));

      const result = await createInvoice(prev, formData);

      if (result?.success) {
        setOpen(false);
        setFormKey((k) => k + 1);
        setItems([emptyItem(0)]);
        setNextKey(1);
      }

      return result;
    },
    null,
  );

  const today = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Invoice</DialogTitle>
          <DialogDescription>
            Record a new bill from a supplier with line items.
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={action} className="space-y-6">
          {/* Invoice Header */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyId">
                Supplier <span className="text-destructive">*</span>
              </Label>
              <Select name="companyId">
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">
                Invoice Number <span className="text-destructive">*</span>
              </Label>
              <Input id="invoiceNumber" name="invoiceNumber" required />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">
                Invoice Date <span className="text-destructive">*</span>
              </Label>
              <Input id="invoiceDate" name="invoiceDate" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue="received">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" />
                Add Item
              </Button>
            </div>

            {items.map((item, idx) => (
              <div key={item.key} className="rounded-md border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Item {idx + 1}</span>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeItem(item.key)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Product (optional)</Label>
                    <Select
                      value={item.productId}
                      onValueChange={(v) => handleProductSelect(item.key, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name} {p.sku ? `(${p.sku})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Description <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(item.key, "description", e.target.value)}
                      placeholder="Item description"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, "quantity", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unit Price (₹)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.key, "unitPrice", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tax %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={item.taxPercent}
                      onChange={(e) => updateItem(item.key, "taxPercent", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}

            {state?.fieldErrors?.items && (
              <p className="text-sm text-destructive">
                {Array.isArray(state.fieldErrors.items)
                  ? (state.fieldErrors.items as string[])[0]
                  : "Invalid line items."}
              </p>
            )}
          </div>

          {/* Discount & Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="discountAmount">Discount (₹)</Label>
              <Input
                id="discountAmount"
                name="discountAmount"
                type="number"
                step="0.01"
                min="0"
                defaultValue="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={2} placeholder="Invoice notes..." />
            </div>
          </div>

          {state?.error && !state.fieldErrors && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create Invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
