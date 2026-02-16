import { db } from "@/db";
import { vendors } from "@/db/schema";
import { desc } from "drizzle-orm";
import { VendorList } from "@/components/vendors/vendor-list";
import { VendorDialog } from "@/components/vendors/vendor-dialog";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const vendorList = await db
    .select()
    .from(vendors)
    .orderBy(desc(vendors.createdAt));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
          <p className="text-muted-foreground">
            Manage your suppliers and vendors.
          </p>
        </div>
        <VendorDialog />
      </div>

      <VendorList vendors={vendorList} />
    </div>
  );
}
