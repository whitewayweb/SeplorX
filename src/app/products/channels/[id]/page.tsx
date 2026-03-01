import { db } from "@/db";
import { channelProducts, channels } from "@/db/schema";
import { desc, eq, and, or, ilike, sql, ne, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CornerDownRight } from "lucide-react";
import { Fragment } from "react";
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

  const baseCondition = and(
    eq(channelProducts.channelId, channelId),
    or(ne(channelProducts.type, "variation"), isNull(channelProducts.type))
  );

  const queryCondition = query
    ? or(
      ilike(channelProducts.name, `%${query}%`),
      ilike(channelProducts.sku, `%${query}%`),
      ilike(channelProducts.externalId, `%${query}%`),
      // Also match if any of its child variations contain the search term
      sql`EXISTS (
          SELECT 1 FROM ${channelProducts} child
          WHERE COALESCE(child.raw_data->>'parentId', CAST(child.raw_data->>'parent_id' AS TEXT)) = ${channelProducts.externalId}
          AND child.channel_id = ${channelId}
          AND (
            child.name ILIKE ${`%${query}%`} OR
            child.sku ILIKE ${`%${query}%`} OR
            child.external_id ILIKE ${`%${query}%`}
          )
        )`
    )
    : undefined;

  const whereCondition = and(baseCondition, queryCondition);

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

  let variationsList: (typeof productsList[0] & { parentId?: string })[] = [];

  if (productsList.length > 0) {
    const parentIds = productsList.map((p) => p.externalId);
    const parentIdsSql = sql.join(parentIds.map((id) => sql`${id}`), sql`, `);

    variationsList = await db
      .select({
        id: channelProducts.id,
        externalId: channelProducts.externalId,
        name: channelProducts.name,
        sku: channelProducts.sku,
        type: channelProducts.type,
        stockQuantity: channelProducts.stockQuantity,
        lastSyncedAt: channelProducts.lastSyncedAt,
        parentId: sql<string>`COALESCE(raw_data->>'parentId', CAST(raw_data->>'parent_id' AS TEXT))`,
      })
      .from(channelProducts)
      .where(
        and(
          eq(channelProducts.channelId, channelId),
          eq(channelProducts.type, "variation"),
          sql`COALESCE(raw_data->>'parentId', CAST(raw_data->>'parent_id' AS TEXT)) IN (${parentIdsSql})`
        )
      )
      .orderBy(desc(channelProducts.lastSyncedAt));
  }

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
                productsList.map((product) => {
                  const productVariations = variationsList.filter(
                    (v) => v.parentId === product.externalId
                  );

                  return (
                    <Fragment key={product.id}>
                      <TableRow className={productVariations.length > 0 ? "border-b-0" : ""}>
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

                      {productVariations.map((variation) => (
                        <TableRow key={variation.id} className="bg-muted/30 hover:bg-muted/40 transition-colors">
                          <TableCell className="whitespace-nowrap pl-6">
                            <div className="flex items-center gap-2">
                              <CornerDownRight className="h-4 w-4 text-muted-foreground/50" />
                              <div className="font-mono text-sm">
                                {variation.externalId}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium whitespace-normal min-w-[250px] max-w-xl text-sm pl-4">
                            {variation.name.includes(" — ") ? variation.name.split(" — ").pop() : variation.name}
                            <div className="font-mono text-xs text-muted-foreground/70 mt-0.5">
                              {variation.sku || "-"}
                            </div>
                          </TableCell>
                          <TableCell>
                            {variation.type ? (
                              <Badge variant="secondary" className="capitalize text-[10px] font-medium px-2 py-0">
                                {variation.type}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {variation.stockQuantity !== null
                              ? variation.stockQuantity
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {variation.lastSyncedAt ? (
                              <div className="flex flex-col items-end">
                                <span className="text-[14px] font-medium text-foreground">
                                  {new Date(variation.lastSyncedAt).toLocaleDateString()}
                                </span>
                                <span className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                                  {new Date(variation.lastSyncedAt).toLocaleTimeString()}
                                </span>
                              </div>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <TablePagination totalItems={count} itemsPerPage={limit} currentPage={page} />
    </div>
  );
}
