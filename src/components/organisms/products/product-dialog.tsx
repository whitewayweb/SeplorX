"use client";

import { useActionState, useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createProduct, updateProduct, getAttributeKeys, getAttributeValuesAction } from "@/app/(dashboard)/products/actions";
import { Plus, Pencil, X } from "lucide-react";

type Product = {
  id: number;
  name: string;
  sku: string | null;
  description?: string | null;
  category: string | null;
  attributes?: Record<string, string>;
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

  // ── Attributes state ────────────────────────────────────────────────────────
  const [attrs, setAttrs] = useState<Array<{ key: string; value: string }>>(() => {
    const initial = isEdit && product.attributes ? product.attributes : {};
    const entries = Object.entries(initial);
    return entries.length > 0 ? entries.map(([k, v]) => ({ key: k, value: v })) : [];
  });

  const [existingKeys, setExistingKeys] = useState<{key: string; count: number}[]>([]);
  const [existingValues, setExistingValues] = useState<Record<string, {value: string; count: number}[]>>({});

  useEffect(() => {
    if (open) {
      getAttributeKeys().then(setExistingKeys).catch(console.error);
    }
  }, [open]);

  const loadValuesForKey = async (k: string) => {
    const trimmed = k.trim();
    if (!trimmed || existingValues[trimmed]) return;
    try {
      const vals = await getAttributeValuesAction(trimmed);
      setExistingValues(prev => ({ ...prev, [trimmed]: vals }));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (open) {
      attrs.forEach(a => {
        if (a.key.trim()) loadValuesForKey(a.key);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function addAttr() {
    setAttrs((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeAttr(idx: number) {
    setAttrs((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateAttr(idx: number, field: "key" | "value", val: string) {
    setAttrs((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: val } : a)));
  }

  // Serialize attributes as JSON for the hidden input
  function serializeAttrs(): string {
    const obj: Record<string, string> = {};
    for (const a of attrs) {
      const k = a.key.trim();
      if (k && a.value.trim()) obj[k] = a.value.trim();
    }
    return JSON.stringify(obj);
  }

  const [state, action, pending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = isEdit
        ? await updateProduct(prev, formData)
        : await createProduct(prev, formData);

      if (result?.success) {
        toast.success(isEdit ? "Product updated successfully" : "Product created successfully");
        setOpen(false);
        setFormKey((k) => k + 1);
      } else if (result?.error) {
        toast.error(result.error);
      }

      return result;
    },
    null,
  );

  // Reset attributes when dialog re-opens (formKey changes on close after success)
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      const initial = isEdit && product.attributes ? product.attributes : {};
      const entries = Object.entries(initial);
      setAttrs(entries.length > 0 ? entries.map(([k, v]) => ({ key: k, value: v })) : []);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
          <input type="hidden" name="attributes" value={serializeAttrs()} />

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

          {/* ── Attributes ──────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Attributes</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addAttr} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {attrs.length === 0 && (
              <p className="text-xs text-muted-foreground">No attributes. Click &quot;Add&quot; to add one (e.g., color, size).</p>
            )}
            {existingKeys.length > 0 && (
              <datalist id="attr-keys-list">
                {existingKeys.map((k) => (
                  <option key={k.key} value={k.key} />
                ))}
              </datalist>
            )}
            
            {attrs.map((attr, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  className="h-8 text-sm flex-1"
                  placeholder="Key (e.g., color)"
                  value={attr.key}
                  list="attr-keys-list"
                  onChange={(e) => {
                    updateAttr(idx, "key", e.target.value);
                    loadValuesForKey(e.target.value);
                  }}
                />
                
                {existingValues[attr.key.trim()] && existingValues[attr.key.trim()].length > 0 && (
                  <datalist id={`attr-values-list-${idx}`}>
                    {existingValues[attr.key.trim()].map((v) => (
                      <option key={v.value} value={v.value} />
                    ))}
                  </datalist>
                )}
                
                <Input
                  className="h-8 text-sm flex-1"
                  placeholder="Value (e.g., Yellow)"
                  value={attr.value}
                  list={`attr-values-list-${idx}`}
                  onChange={(e) => updateAttr(idx, "value", e.target.value)}
                />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeAttr(idx)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
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
