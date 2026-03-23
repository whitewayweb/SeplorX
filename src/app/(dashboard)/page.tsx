import {
  getOutOfSyncProductCount,
  getOrdersAwaitingReturnAction,
  getTotalActiveReservations,
  getLowStockProductsCount,
  getRecentOrders,
} from "@/data/stock";
import Link from "next/link";
import { AlertCircle, RotateCcw, Package, AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [
    outOfSyncCount,
    returnsAwaiting,
    totalReserved,
    lowStockCount,
    recentOrders,
  ] = await Promise.all([
    getOutOfSyncProductCount(),
    getOrdersAwaitingReturnAction(),
    getTotalActiveReservations(),
    getLowStockProductsCount(),
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

      <div className="pt-4">
        <div className="flex items-center justify-between mb-4">
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
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground text-sm">
                    No recent orders.
                  </TableCell>
                </TableRow>
              ) : (
                recentOrders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-mono text-sm">
                      <Link href={`/orders/${order.id}`} className="text-blue-600 hover:underline">
                        {order.externalOrderId}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {order.buyerName || "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${order.status === 'delivered' || order.status === 'shipped' ? 'bg-green-100 text-green-800' :
                        order.status === 'cancelled' || order.status === 'failed' ? 'bg-red-100 text-red-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                        {order.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
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
      </div>
    </div>
  );
}
