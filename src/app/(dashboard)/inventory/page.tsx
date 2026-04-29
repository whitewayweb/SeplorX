import { getAuthenticatedUserId } from "@/lib/auth";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { InventoryTransactionsTable } from "@/components/organisms/inventory/inventory-transactions-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpFromLine, Package, AlertTriangle, PackageX } from "lucide-react";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { ReorderTrigger } from "@/components/organisms/agents/reorder-trigger";
import { ReorderApprovalCard } from "@/components/organisms/agents/reorder-approval-card";
import type { ReorderPlan } from "@/lib/agents/tools/inventory-tools";
import { 
  getTotalActiveProductsCount, 
  getLowStockProducts, 
  getTotalStockValue, 
  getRecentInventoryTransactions 
} from "@/data/inventory";
import { getPendingAgentTasks } from "@/data/agents";
import { getPendingStockSyncProductCount } from "@/data/products";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const userId = await getAuthenticatedUserId();

  // Run all 5 independent queries in parallel
  const [
    { count: totalProductsCount },
    lowStockProducts,
    { totalValue },
    recentTransactions,
    pendingReorderTasks,
    pendingStockSyncCount,
  ] = await Promise.all([
    getTotalActiveProductsCount(),
    getLowStockProducts(),
    getTotalStockValue(),
    getRecentInventoryTransactions(),
    getPendingAgentTasks("reorder"),
    getPendingStockSyncProductCount(userId),
  ]);

  const outOfStock = lowStockProducts.filter((p) => p.quantityOnHand <= 0);
  const lowStock = lowStockProducts.filter((p) => p.quantityOnHand > 0);

  const stockValueNum = parseFloat(totalValue);
  const formattedStockValue = isNaN(stockValueNum)
    ? "₹0.00"
    : `₹${stockValueNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Inventory"
        description="Stock overview, alerts, and recent transactions."
      >
        <Button variant={pendingStockSyncCount > 0 ? "default" : "outline"} asChild>
          <Link href="/inventory/sync">
            <ArrowUpFromLine className="h-4 w-4 mr-2" />
            Stock Sync {pendingStockSyncCount > 0 ? `(${pendingStockSyncCount})` : ""}
          </Link>
        </Button>
        {AGENT_REGISTRY.reorder.enabled && <ReorderTrigger />}
      </PageHeader>

      {/* Pending AI Recommendations */}
      {pendingReorderTasks.length > 0 && (
        <div className="space-y-3">
          {pendingReorderTasks.map((task) => (
            <ReorderApprovalCard
              key={task.id}
              taskId={task.id}
              plan={task.plan as unknown as ReorderPlan}
              createdAt={task.createdAt}
            />
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalProductsCount}</p>
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
        <Card className={pendingStockSyncCount > 0 ? "border-yellow-200 bg-yellow-50/40" : undefined}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Sync Required</CardTitle>
            <ArrowUpFromLine className={`h-4 w-4 ${pendingStockSyncCount > 0 ? "text-yellow-600" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${pendingStockSyncCount > 0 ? "text-yellow-700" : ""}`}>{pendingStockSyncCount}</p>
            <Link href="/inventory/sync" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
              Review queue
            </Link>
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
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Reorder Level</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">
                        <Link href={`/products/${product.id}`} className="hover:underline text-primary">
                          {product.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{product.sku ?? "—"}</TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell className="text-right font-mono">{product.quantityOnHand}</TableCell>
                      <TableCell className="text-right font-mono text-amber-600">
                        {product.reservedQuantity > 0 ? product.reservedQuantity : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {product.quantityOnHand - product.reservedQuantity}
                      </TableCell>
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
          <InventoryTransactionsTable
            transactions={recentTransactions}
            showProduct
          />
        </CardContent>
      </Card>
    </div>
  );
}
