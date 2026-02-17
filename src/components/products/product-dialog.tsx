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
import { createProduct, updateProduct } from "@/app/products/actions";
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";

type Product = {
  id: number;
  name: string;
  sku: string | null;
  description?: string | null;
  category: string | null;
  unit: string;
  purchasePrice: string | null;
  sellingPrice: string | null;
  reorderLevel: number;
  quantityOnHand?: number;
  isActive?: boolean;
};

interface ProductDialogProps {
  product?: Product;
}

const PRODUCT_FIELDS = [
  { key: "name", label: "Product Name", required: true, type: "text" as const },
  { key: "sku", label: "SKU", required: false, type: "text" as const },
  { key: "category", label: "Category", required: false, type: "text" as const },
  { key: "unit", label: "Unit", required: true, type: "text" as const },
  { key: "purchasePrice", label: "Purchase Price (₹)", required: false, type: "number" as const },
  { key: "sellingPrice", label: "Selling Price (₹)", required: false, type: "number" as const },
  { key: "reorderLevel", label: "Reorder Level", required: true, type: "number" as const },
] as const;

export function ProductDialog({ product }: ProductDialogProps) {
  const isEdit = !!product;
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const [state, action, pending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = isEdit
        ? await updateProduct(prev, formData)
        : await createProduct(prev, formData);

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
        {isEdit ? (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Product" : "Add Product"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update product details below."
              : "Enter the product details to add a new item."}
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={action} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={product.id} />}

          {PRODUCT_FIELDS.map((field) => {
            let defaultValue = "";
            if (isEdit && product) {
              const raw = product[field.key as keyof Product];
              defaultValue = raw != null ? String(raw) : "";
            } else if (field.key === "unit") {
              defaultValue = "pcs";
            } else if (field.key === "reorderLevel") {
              defaultValue = "0";
            }

            return (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </Label>
                <Input
                  id={field.key}
                  name={field.key}
                  type={field.type}
                  defaultValue={defaultValue}
                  required={field.required}
                  step={field.type === "number" ? "0.01" : undefined}
                  min={field.type === "number" ? "0" : undefined}
                />
                {state?.fieldErrors?.[field.key as keyof typeof state.fieldErrors] && (
                  <p className="text-sm text-destructive">
                    {(state.fieldErrors[field.key as keyof typeof state.fieldErrors] as string[])?.[0]}
                  </p>
                )}
              </div>
            );
          })}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={isEdit ? product.description ?? "" : ""}
              rows={3}
              placeholder="Product description..."
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
              {pending
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save Changes"
                  : "Create Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
