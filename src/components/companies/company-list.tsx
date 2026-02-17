"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CompanyStatusBadge } from "@/components/companies/company-status-badge";
import { CompanyTypeBadge } from "@/components/companies/company-type-badge";
import { CompanyDialog } from "@/components/companies/company-dialog";
import { toggleCompanyActive, deleteCompany } from "@/app/companies/actions";
import { Eye, Power, Trash2 } from "lucide-react";

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
  isActive: boolean;
  createdAt: Date | null;
};

interface CompanyListProps {
  companies: Company[];
}

function ToggleButton({ company }: { company: Company }) {
  const [, action, pending] = useActionState(toggleCompanyActive, null);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={company.id} />
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        disabled={pending}
        title={company.isActive ? "Deactivate" : "Activate"}
      >
        <Power className={`h-4 w-4 ${company.isActive ? "text-green-600" : "text-muted-foreground"}`} />
      </Button>
    </form>
  );
}

function DeleteButton({ company }: { company: Company }) {
  const [state, action, pending] = useActionState(deleteCompany, null);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={company.id} />
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        disabled={pending}
        title="Delete company"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      {state?.error && (
        <span className="text-xs text-destructive">{state.error}</span>
      )}
    </form>
  );
}

export function CompanyList({ companies }: CompanyListProps) {
  if (companies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-lg">No companies yet</p>
        <p className="text-muted-foreground text-sm mt-1">
          Add your first company to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>GST</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow key={company.id}>
              <TableCell className="font-medium">{company.name}</TableCell>
              <TableCell>
                <CompanyTypeBadge type={company.type} />
              </TableCell>
              <TableCell>{company.contactPerson ?? "—"}</TableCell>
              <TableCell>{company.phone ?? "—"}</TableCell>
              <TableCell className="font-mono text-sm">
                {company.gstNumber ?? "—"}
              </TableCell>
              <TableCell>{company.city ?? "—"}</TableCell>
              <TableCell>
                <CompanyStatusBadge isActive={company.isActive} />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/companies/${company.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  <CompanyDialog company={company} />
                  <ToggleButton company={company} />
                  <DeleteButton company={company} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
