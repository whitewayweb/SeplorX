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
import { VendorStatusBadge } from "@/components/vendors/vendor-status-badge";
import { VendorDialog } from "@/components/vendors/vendor-dialog";
import { toggleVendorActive, deleteVendor } from "@/app/vendors/actions";
import { Eye, Power, Trash2 } from "lucide-react";

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
  isActive: boolean;
  createdAt: Date | null;
};

interface VendorListProps {
  vendors: Vendor[];
}

function ToggleButton({ vendor }: { vendor: Vendor }) {
  const [, action, pending] = useActionState(toggleVendorActive, null);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={vendor.id} />
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        disabled={pending}
        title={vendor.isActive ? "Deactivate" : "Activate"}
      >
        <Power className={`h-4 w-4 ${vendor.isActive ? "text-green-600" : "text-muted-foreground"}`} />
      </Button>
    </form>
  );
}

function DeleteButton({ vendor }: { vendor: Vendor }) {
  const [state, action, pending] = useActionState(deleteVendor, null);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={vendor.id} />
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        disabled={pending}
        title="Delete vendor"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      {state?.error && (
        <span className="text-xs text-destructive">{state.error}</span>
      )}
    </form>
  );
}

export function VendorList({ vendors }: VendorListProps) {
  if (vendors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-lg">No vendors yet</p>
        <p className="text-muted-foreground text-sm mt-1">
          Add your first vendor to get started.
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
            <TableHead>Contact</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>GST</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendors.map((vendor) => (
            <TableRow key={vendor.id}>
              <TableCell className="font-medium">{vendor.name}</TableCell>
              <TableCell>{vendor.contactPerson ?? "—"}</TableCell>
              <TableCell>{vendor.phone ?? "—"}</TableCell>
              <TableCell className="font-mono text-sm">
                {vendor.gstNumber ?? "—"}
              </TableCell>
              <TableCell>{vendor.city ?? "—"}</TableCell>
              <TableCell>
                <VendorStatusBadge isActive={vendor.isActive} />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/vendors/${vendor.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  <VendorDialog vendor={vendor} />
                  <ToggleButton vendor={vendor} />
                  <DeleteButton vendor={vendor} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
