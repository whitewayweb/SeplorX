import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getPendingStockSyncProductSummaries } from "@/data/products";
import { StockSyncQueue } from "./stock-sync-queue";

export const dynamic = "force-dynamic";

export default async function InventorySyncPage() {
  const userId = await getAuthenticatedUserId();
  const products = await getPendingStockSyncProductSummaries(userId);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Stock Sync Queue"
        description="Review stock changes and push available stock to channels."
      >
        <Button variant="outline" asChild>
          <Link href="/inventory" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Inventory
          </Link>
        </Button>
      </PageHeader>

      <StockSyncQueue products={products} />
    </div>
  );
}
