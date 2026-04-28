import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getPendingStockSyncProducts } from "@/data/products";
import { getChannelById } from "@/lib/channels/registry";
import { StockSyncQueue } from "./stock-sync-queue";
import type { ChannelType } from "@/lib/channels/types";

export const dynamic = "force-dynamic";

export default async function InventorySyncPage() {
  const userId = await getAuthenticatedUserId();
  const products = await getPendingStockSyncProducts(userId);

  const enrichedProducts = products.map((product) => ({
    ...product,
    mappings: product.mappings.map((mapping) => {
      const channelDef = getChannelById(mapping.channelType as ChannelType);
      return {
        ...mapping,
        canPushStock: !!channelDef?.capabilities?.canPushStock,
      };
    }),
  }));

  const pendingMappings = enrichedProducts.reduce(
    (total, product) => total + product.mappings.filter((mapping) => mapping.syncStatus === "pending_update").length,
    0,
  );
  const failedMappings = enrichedProducts.reduce(
    (total, product) => total + product.mappings.filter((mapping) => mapping.syncStatus === "failed").length,
    0,
  );
  const supportedMappings = enrichedProducts.reduce(
    (total, product) => total + product.mappings.filter((mapping) => mapping.canPushStock).length,
    0,
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Stock Sync Queue"
        description="Review mapped SeplorX products with stock changes and push available stock to connected channels."
      >
        <Button variant="outline" asChild>
          <Link href="/inventory" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Inventory
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Products To Push</CardTitle>
            <PackageCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{enrichedProducts.length}</p>
            <p className="text-xs text-muted-foreground mt-1">SeplorX products needing action</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Mapped Listings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-700">{pendingMappings}</p>
            <p className="text-xs text-muted-foreground mt-1">Channel listings waiting for stock push</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Push Targets</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-700">{supportedMappings}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {failedMappings > 0 ? `${failedMappings} failed mapping${failedMappings === 1 ? "" : "s"} need retry` : "Ready for manual push"}
            </p>
          </CardContent>
        </Card>
      </div>

      <StockSyncQueue products={enrichedProducts} />
    </div>
  );
}
