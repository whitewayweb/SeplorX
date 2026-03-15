import Image from "next/image";
import { notFound } from "next/navigation";
import { TableSearch } from "@/components/ui/table-search";
import { TablePagination } from "@/components/ui/table-pagination";
import { getChannel, getChannelProductsWithVariations } from "@/lib/channels/queries";
import { getChannelById } from "@/lib/channels/registry";
import { parsePaginationParams } from "@/lib/utils/pagination";
import { ClearProductsButton } from "@/components/organisms/channels/clear-products-button";
import { ChannelProductsTable } from "@/components/organisms/channels/channel-products-table";
import { getChannelHandler } from "@/lib/channels/handlers";
import { BrandTabs } from "@/components/organisms/channels/brand-tabs";
import { SyncProductsButton } from "@/components/organisms/channels/sync-products-button";
import type { ChannelType } from "@/lib/channels/types";

export const dynamic = "force-dynamic";

export default async function ChannelProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await params;
  const channelId = parseInt(resolvedParams.id, 10);

  const resolvedSearchParams = await searchParams;
  const { query, page, limit, offset } = parsePaginationParams(resolvedSearchParams);
  const brand = typeof resolvedSearchParams?.brand === "string" ? resolvedSearchParams.brand : undefined;

  if (isNaN(channelId)) {
    notFound();
  }

  const channel = await getChannel(channelId);

  if (!channel) {
    notFound();
  }

  // Resolve the channel definition from the registry (for icon + getBrands)
  const channelDef = getChannelById(channel.channelType as ChannelType);

  // Fetch brands via the registry-defined getBrands — falls back to empty array
  // Run both queries in parallel.
  const [
    { products: productsList, variations: variationsList, totalCount: count },
    brands,
  ] = await Promise.all([
    getChannelProductsWithVariations(channelId, { query, brand, limit, offset }),
    channelDef?.getBrands?.(channelId) ?? Promise.resolve([]),
  ]);

  const handler = getChannelHandler(channel.channelType);
  const canRefetchItem = !!handler?.getCatalogItem;
  const channelIcon = channelDef?.icon ?? null;

  return (
    <div className="p-6 space-y-4">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-bold tracking-tight">{channel.name} Products</h1>
            {channelIcon && (
              <Image
                src={channelIcon}
                alt={`${channel.name} icon`}
                width={28}
                height={28}
                className="object-contain rounded"
              />
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Browse all products fetched from {channel.name}. Total: {count}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TableSearch placeholder="Search by name, SKU..." />
          {channelDef?.capabilities?.canFetchProducts && (
            <SyncProductsButton channelId={channelId} />
          )}
          {count > 0 && <ClearProductsButton channelId={channelId} />}
        </div>
      </div>

      {/* ── Brand Tabs ────────────────────────────────────────────────── */}
      {brands.length > 0 && (
        <BrandTabs brands={brands} />
      )}

      {/* ── Products Table ────────────────────────────────────────────── */}
      <ChannelProductsTable
        channelId={channelId}
        products={productsList}
        variations={variationsList}
        canRefetchItem={canRefetchItem}
      />

      <TablePagination totalItems={count} itemsPerPage={limit} currentPage={page} />
    </div>
  );
}
