import { db } from "@/db";
import { products, inventoryTransactions } from "@/db/schema";
import { desc, eq, lte, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, AlertTriangle, PackageX, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

const TRANSACTION_TYPE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  purchase_in: { label: "Purchase In", variant: "default" },
  sale_out: { label: "Sale Out", variant: "destructive" },
  adjustment: { label: "Adjustment", variant: "secondary" },
  return: { label: "Return", variant: "outline" },
};

export default async function InventoryPage() {
  // Summary stats
  const [totalProducts] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.isActive, true));

  const lowStockProducts = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      unit: products.unit,
      quantityOnHand: products.quantityOnHand,
      reorderLevel: products.reorderLevel,
    })
    .from(products)
    .where(
      lte(products.quantityOnHand, products.reorderLevel),
    )
    .orderBy(products.quantityOnHand);

  const outOfStock = lowStockProducts.filter((p) => p.quantityOnHand <= 0);
  const lowStock = lowStockProducts.filter((p) => p.quantityOnHand > 0);

  // Total stock value (sum of quantity * purchase_price for active products)
  const [stockValue] = await db
    .select({
      totalValue: sql<string>`coalesce(sum(${products.quantityOnHand}::numeric * ${products.purchasePrice}), 0)`,
    })
    .from(products)
    .where(eq(products.isActive, true));

  // Recent transactions
  const recentTransactions = await db
    .select({
      id: inventoryTransactions.id,
      productId: inventoryTransactions.productId,
      type: inventoryTransactions.type,
      quantity: inventoryTransactions.quantity,
      referenceType: inventoryTransactions.referenceType,
      notes: inventoryTransactions.notes,
      createdAt: inventoryTransactions.createdAt,
      productName: products.name,
    })
    .from(inventoryTransactions)
    .innerJoin(products, eq(inventoryTransactions.productId, products.id))
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(20);

  const stockValueNum = parseFloat(stockValue.totalValue);
  const formattedStockValue = isNaN(stockValueNum)
    ? "₹0.00"
    : `₹${stockValueNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
        <p className="text-muted-foreground">
          Stock overview, alerts, and recent transactions.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalProducts.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{lowStock.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
            <PackageX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{outOfStock.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Value</CardTitle>
            <span className="text-sm text-muted-foreground">₹</span>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formattedStockValue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock / Out of Stock Alerts */}
      {lowStockProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Reorder Level</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="font-mono text-sm">{product.sku ?? "—"}</TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell className="text-right font-mono">{product.quantityOnHand}</TableCell>
                      <TableCell className="text-right font-mono">{product.reorderLevel}</TableCell>
                      <TableCell>
                        {product.quantityOnHand <= 0 ? (
                          <Badge variant="destructive">Out of stock</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                            Low stock
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/products/${product.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No inventory transactions yet. Adjust stock on a product to create your first entry.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransactions.map((txn) => {
                    const typeConfig = TRANSACTION_TYPE_LABELS[txn.type] ?? { label: txn.type, variant: "outline" as const };
                    return (
                      <TableRow key={txn.id}>
                        <TableCell className="text-sm">
                          {txn.createdAt
                            ? new Date(txn.createdAt).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/products/${txn.productId}`}
                            className="font-medium hover:underline"
                          >
                            {txn.productName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={typeConfig.variant}>{typeConfig.label}</Badge>
                        </TableCell>
                        <TableCell className={`text-right font-mono ${txn.quantity > 0 ? "text-green-600" : "text-red-600"}`}>
                          {txn.quantity > 0 ? `+${txn.quantity}` : txn.quantity}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {txn.referenceType ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                          {txn.notes ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
