import { notFound } from "next/navigation";
import { TableSearch } from "@/components/ui/table-search";
import { TablePagination } from "@/components/ui/table-pagination";
import { getChannel, getChannelProductsWithVariations } from "@/lib/channels/queries";
import { parsePaginationParams } from "@/lib/utils/pagination";
import { ClearProductsButton } from "@/components/channels/clear-products-button";
import { ChannelProductsTable } from "@/components/channels/channel-products-table";
import { getChannelHandler } from "@/lib/channels/handlers";

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

  if (isNaN(channelId)) {
    notFound();
  }

  const channel = await getChannel(channelId);

  if (!channel) {
    notFound();
  }

  const { products: productsList, variations: variationsList, totalCount: count } =
    await getChannelProductsWithVariations(channelId, { query, limit, offset });

  const handler = getChannelHandler(channel.channelType);
  const canRefetchItem = !!handler?.getCatalogItem;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{channel.name} Products</h1>
          <p className="text-muted-foreground mt-1">
            Browse all products fetched from {channel.name}. Total: {count}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <TableSearch placeholder="Search by name, SKU, or ID..." />
          {count > 0 && <ClearProductsButton channelId={channelId} />}
        </div>
      </div>

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
