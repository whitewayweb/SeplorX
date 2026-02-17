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
import { createCompany, updateCompany } from "@/app/companies/actions";
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";

type Company = {
  id: number;
  name: string;
  type: "supplier" | "customer" | "both";
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

interface CompanyDialogProps {
  company?: Company;
}

const COMPANY_FIELDS = [
  { key: "name", label: "Company Name", required: true, type: "text" as const },
  { key: "contactPerson", label: "Contact Person", required: false, type: "text" as const },
  { key: "email", label: "Email", required: false, type: "email" as const },
  { key: "phone", label: "Phone", required: false, type: "tel" as const },
  { key: "gstNumber", label: "GST Number", required: false, type: "text" as const },
  { key: "address", label: "Address", required: false, type: "textarea" as const },
  { key: "city", label: "City", required: false, type: "text" as const },
  { key: "state", label: "State", required: false, type: "text" as const },
  { key: "pincode", label: "Pincode", required: false, type: "text" as const },
] as const;

export function CompanyDialog({ company }: CompanyDialogProps) {
  const isEdit = !!company;
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const [state, action, pending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = isEdit
        ? await updateCompany(prev, formData)
        : await createCompany(prev, formData);

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
            Add Company
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Company" : "Add Company"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update company details below."
              : "Enter the company details to add a new business entity."}
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={action} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={company.id} />}

          {/* Company Type */}
          <div className="space-y-2">
            <Label htmlFor="type">
              Type
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Select
              name="type"
              defaultValue={isEdit ? company.type : "supplier"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="supplier">Supplier</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="both">Both (Supplier & Customer)</SelectItem>
              </SelectContent>
            </Select>
            {state?.fieldErrors?.type && (
              <p className="text-sm text-destructive">
                {(state.fieldErrors.type as string[])?.[0]}
              </p>
            )}
          </div>

          {COMPANY_FIELDS.map((field) => {
            const defaultValue =
              isEdit && company
                ? (company[field.key as keyof Company] as string) ?? ""
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
              defaultValue={isEdit ? company.notes ?? "" : ""}
              rows={3}
              placeholder="Internal notes about this company..."
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
                  : "Create Company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
