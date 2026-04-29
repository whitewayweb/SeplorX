import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { getAuthenticatedUserId } from "@/lib/auth";
import {
  getPendingStockSyncProductSummaries,
  getStockSyncQueueChannelOptions,
  type StockSyncQueueStatusFilter,
} from "@/data/products";
import { parsePaginationParams } from "@/lib/utils/pagination";
import { StockSyncQueue } from "./stock-sync-queue";

export const dynamic = "force-dynamic";

export default async function InventorySyncPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const { query, page, limit, offset } = parsePaginationParams(resolvedSearchParams);
  const statusParam = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : "all";
  const statusFilter: StockSyncQueueStatusFilter = ["all", "ready", "review", "failed"].includes(statusParam)
    ? (statusParam as StockSyncQueueStatusFilter)
    : "all";
  const channelFilter = typeof resolvedSearchParams.channel === "string" ? resolvedSearchParams.channel : "all";
  const userId = await getAuthenticatedUserId();
  const [{ products, totalCount }, channelOptions] = await Promise.all([
    getPendingStockSyncProductSummaries(userId, {
      search: query,
      status: statusFilter,
      channelName: channelFilter,
      limit,
      offset,
    }),
    getStockSyncQueueChannelOptions(userId),
  ]);

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

      <StockSyncQueue
        products={products}
        channelOptions={channelOptions}
        totalCount={totalCount}
        currentPage={page}
        pageSize={limit}
        initialSearchQuery={query}
        initialStatusFilter={statusFilter}
        initialChannelFilter={channelFilter}
      />
    </div>
  );
}
