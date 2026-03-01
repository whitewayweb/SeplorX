import { db } from "@/db";
import { channelProducts, channels } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
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

export const dynamic = "force-dynamic";

export default async function ChannelProductsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const channelId = parseInt(resolvedParams.id, 10);

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
    .where(eq(channelProducts.channelId, channelId))
    .orderBy(desc(channelProducts.lastSyncedAt));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{channel.name} Products</h1>
          <p className="text-muted-foreground mt-1">
            Browse all products fetched from {channel.name}. Total: {productsList.length}
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>External ID / SKU</TableHead>
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
                      <div className="font-mono text-xs text-muted-foreground/70 mt-0.5">
                        {product.sku || "-"}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium whitespace-normal min-w-[250px] max-w-xl">
                      {product.name}
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
    </div>
  );
}
