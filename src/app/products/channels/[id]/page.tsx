import { db } from "@/db";
import { channelProducts, channels } from "@/db/schema";
import { desc, eq, and, or, ilike, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TableSearch } from "@/components/ui/table-search";
import { TablePagination } from "@/components/ui/table-pagination";

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
  const query = typeof resolvedSearchParams?.q === "string" ? resolvedSearchParams.q : "";
  const page = parseInt((resolvedSearchParams?.page as string) || "1", 10);
  const limit = parseInt((resolvedSearchParams?.limit as string) || "20", 10);
  const offset = (page - 1) * limit;

  if (isNaN(channelId)) {
    notFound();
  }

  const [channel] = await db
    .select({ name: channels.name })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);

  if (!channel) {
    notFound();
  }

  const whereCondition = and(
    eq(channelProducts.channelId, channelId),
    query
      ? or(
        ilike(channelProducts.name, `%${query}%`),
        ilike(channelProducts.sku, `%${query}%`),
        ilike(channelProducts.externalId, `%${query}%`)
      )
      : undefined
  );

  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(channelProducts)
    .where(whereCondition);

  const productsList = await db
    .select({
      id: channelProducts.id,
      externalId: channelProducts.externalId,
      name: channelProducts.name,
      sku: channelProducts.sku,
      type: channelProducts.type,
      stockQuantity: channelProducts.stockQuantity,
      lastSyncedAt: channelProducts.lastSyncedAt,
    })
    .from(channelProducts)
    .where(whereCondition)
    .orderBy(desc(channelProducts.lastSyncedAt))
    .limit(limit)
    .offset(offset);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{channel.name} Products</h1>
          <p className="text-muted-foreground mt-1">
            Browse all products fetched from {channel.name}. Total: {count}
          </p>
        </div>
        <TableSearch placeholder="Search by name, SKU, or ID..." />
      </div>

      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>External ID</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Last Synced</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No products synced yet. Go to Channels to fetch products.
                  </TableCell>
                </TableRow>
              ) : (
                productsList.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-mono text-sm">
                        {product.externalId}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium whitespace-normal min-w-[250px] max-w-xl">
                      {product.name}
                      <div className="font-mono text-xs text-muted-foreground/70 mt-0.5">
                        {product.sku || "-"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {product.type ? (
                        <Badge variant="outline" className="capitalize">
                          {product.type}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.stockQuantity !== null
                        ? product.stockQuantity
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {product.lastSyncedAt ? (
                        <div className="flex flex-col items-end">
                          <span className="text-[14px] font-medium text-foreground">
                            {new Date(product.lastSyncedAt).toLocaleDateString()}
                          </span>
                          <span className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                            {new Date(product.lastSyncedAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <TablePagination totalItems={count} itemsPerPage={limit} currentPage={page} />
    </div>
  );
}
