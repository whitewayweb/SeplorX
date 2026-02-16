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
import { createVendor, updateVendor } from "@/app/vendors/actions";
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";

type Vendor = {
  id: number;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  gstNumber: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  notes: string | null;
};

interface VendorDialogProps {
  vendor?: Vendor;
}

export function VendorDialog({ vendor }: VendorDialogProps) {
  const isEdit = !!vendor;
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const [state, action, pending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = isEdit
        ? await updateVendor(prev, formData)
        : await createVendor(prev, formData);

      if (result?.success) {
        setOpen(false);
        setFormKey((k) => k + 1);
      }

      return result;
    },
    null,
  );

  const fields = [
    { key: "name", label: "Vendor Name", required: true, type: "text" as const },
    { key: "contactPerson", label: "Contact Person", required: false, type: "text" as const },
    { key: "email", label: "Email", required: false, type: "email" as const },
    { key: "phone", label: "Phone", required: false, type: "tel" as const },
    { key: "gstNumber", label: "GST Number", required: false, type: "text" as const },
    { key: "address", label: "Address", required: false, type: "textarea" as const },
    { key: "city", label: "City", required: false, type: "text" as const },
    { key: "state", label: "State", required: false, type: "text" as const },
    { key: "pincode", label: "Pincode", required: false, type: "text" as const },
  ] as const;

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
            Add Vendor
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update vendor details below."
              : "Enter the vendor details to add a new supplier."}
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={action} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={vendor.id} />}

          {fields.map((field) => {
            const defaultValue =
              isEdit && vendor
                ? (vendor[field.key as keyof Vendor] as string) ?? ""
                : "";

            return (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </Label>

                {field.type === "textarea" ? (
                  <Textarea
                    id={field.key}
                    name={field.key}
                    defaultValue={defaultValue}
                    rows={3}
                  />
                ) : (
                  <Input
                    id={field.key}
                    name={field.key}
                    type={field.type}
                    defaultValue={defaultValue}
                    required={field.required}
                  />
                )}

                {state?.fieldErrors?.[field.key as keyof typeof state.fieldErrors] && (
                  <p className="text-sm text-destructive">
                    {(state.fieldErrors[field.key as keyof typeof state.fieldErrors] as string[])?.[0]}
                  </p>
                )}
              </div>
            );
          })}

          {/* Notes field */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={isEdit ? vendor.notes ?? "" : ""}
              rows={3}
              placeholder="Internal notes about this vendor..."
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
                  : "Create Vendor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
