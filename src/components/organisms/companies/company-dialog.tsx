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
import { createCompany, updateCompany } from "@/app/(dashboard)/companies/actions";
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

        <form key={formKey} action={action}>
          {isEdit && <input type="hidden" name="id" value={company.id} />}

          <FieldGroup className="gap-4">
          <Field data-invalid={Boolean(state?.fieldErrors?.type)}>
            <FieldLabel htmlFor="type">
              Type
              <span className="text-destructive ml-1">*</span>
            </FieldLabel>
            <Select
              name="type"
              defaultValue={isEdit ? company.type : "supplier"}
            >
              <SelectTrigger id="type" aria-invalid={Boolean(state?.fieldErrors?.type)}>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="supplier">Supplier</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="both">Both (Supplier & Customer)</SelectItem>
              </SelectContent>
            </Select>
            <FieldError>{(state?.fieldErrors?.type as string[] | undefined)?.[0]}</FieldError>
          </Field>

          {COMPANY_FIELDS.map((field) => {
            const defaultValue =
              isEdit && company
                ? (company[field.key as keyof Company] as string) ?? ""
                : "";

            return (
              <Field
                key={field.key}
                data-invalid={Boolean(state?.fieldErrors?.[field.key as keyof typeof state.fieldErrors])}
              >
                <FieldLabel htmlFor={field.key}>
                  {field.label}
                  {field.required && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </FieldLabel>

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
                    aria-invalid={Boolean(state?.fieldErrors?.[field.key as keyof typeof state.fieldErrors])}
                  />
                )}

                <FieldError>
                  {(state?.fieldErrors?.[field.key as keyof typeof state.fieldErrors] as string[] | undefined)?.[0]}
                </FieldError>
              </Field>
            );
          })}

          <Field>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={isEdit ? company.notes ?? "" : ""}
              rows={3}
              placeholder="Internal notes about this company..."
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
              {pending
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save Changes"
                  : "Create Company"}
            </Button>
          </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
