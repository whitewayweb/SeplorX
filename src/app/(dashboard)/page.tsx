import { AlertCircle, RotateCcw, Package, AlertTriangle, ArrowRight, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getOutOfSyncProductCount,
  getOrdersAwaitingReturnAction,
  getTotalActiveReservations,
  getLowStockProductsCount,
  getRecentOrders,
} from "@/data/stock";
import { getTotalUnmappedProductsCount, getUnmappedChannelProducts } from "@/data/channels";
import { getAuthenticatedUserId } from "@/lib/auth";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = await getAuthenticatedUserId();
  const [
    outOfSyncCount,
    returnsAwaiting,
    totalReserved,
    lowStockCount,
    unmappedCount,
    unmappedProducts,
    recentOrders,
  ] = await Promise.all([
    getOutOfSyncProductCount(),
    getOrdersAwaitingReturnAction(),
    getTotalActiveReservations(),
    getLowStockProductsCount(),
    getTotalUnmappedProductsCount(userId),
    getUnmappedChannelProducts(userId, 10),
    getRecentOrders(5),
  ]);

  return (
    <div className="p-6 mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome to SeplorX. Here is an overview of your stock alerts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Out of Sync Stock</CardTitle>
            <AlertCircle className={`h-4 w-4 ${outOfSyncCount > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{outOfSyncCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Products with stock reserved but not pushed
            </p>
            {outOfSyncCount > 0 && (
              <div className="mt-4">
                <Link href="/inventory" className="text-sm text-blue-600 hover:underline">
                  Review & Push Stock →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Returns Awaiting Action</CardTitle>
            <RotateCcw className={`h-4 w-4 ${returnsAwaiting.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{returnsAwaiting.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Orders with items pending restock/discard
            </p>
            {returnsAwaiting.length > 0 && (
              <div className="mt-4">
                <Link href="/orders?status=returned" className="text-sm text-blue-600 hover:underline">
                  Process Returns →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Active Reservations</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalReserved} <span className="text-sm font-normal text-muted-foreground">units</span></div>
            <p className="text-xs text-muted-foreground mt-1">
              Stock currently reserved for orders
            </p>
            <div className="mt-4">
              <Link href="/inventory" className="text-sm text-blue-600 hover:underline">
                View Inventory →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Unmapped Listings</CardTitle>
            <ExternalLink className={`h-4 w-4 ${unmappedCount > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unmappedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Channel SKU listings not linked to SeplorX
            </p>
            {unmappedCount > 0 && (
              <div className="mt-4">
                <Link href="#unmapped-listings" className="text-sm text-blue-600 hover:underline">
                  View Listings →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${lowStockCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Products at or below reorder level
            </p>
            {lowStockCount > 0 && (
              <div className="mt-4">
                <Link href="/inventory" className="text-sm text-blue-600 hover:underline">
                  Restock Products →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="pt-4 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Orders Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Recent Orders</h2>
            <Link href="/orders" className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground text-sm">
                      No recent orders.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentOrders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-mono text-xs py-3">
                        {order.externalOrderId}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 inline-flex text-[10px] leading-5 font-semibold rounded-full ${order.status === 'delivered' || order.status === 'shipped' ? 'bg-green-100 text-green-800' :
                          order.status === 'cancelled' || order.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                          {order.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs">
                        {order.currency && order.totalAmount
                          ? `${order.currency} ${parseFloat(order.totalAmount).toFixed(2)}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Unmapped Listings Section */}
        <section id="unmapped-listings" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
               <h2 className="text-lg font-semibold tracking-tight">Unmapped Listings</h2>
               <Badge variant="secondary" className="px-1.5 h-5 opacity-70">Action Required</Badge>
            </div>
            <Link href="/products" className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1">
              Bulk Map <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <Table>
              <TableHeader className="bg-orange-50/50">
                <TableRow>
                  <TableHead>Listing Title</TableHead>
                  <TableHead>Channel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmappedProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="h-24 text-center text-muted-foreground text-sm">
                      No unmapped products. All channel items are linked!
                    </TableCell>
                  </TableRow>
                ) : (
                  unmappedProducts.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium text-[11px] py-3 leading-relaxed max-w-[300px] truncate">
                        {p.name}
                      </TableCell>
                      <TableCell>
                         <Badge variant="outline" className="text-[9px] font-semibold bg-muted/10 uppercase tracking-tight">
                            {p.channelName}
                         </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {unmappedCount > 10 && (
            <p className="text-[10px] text-muted-foreground text-center">
              And {unmappedCount - 10} more unmapped listings...
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
