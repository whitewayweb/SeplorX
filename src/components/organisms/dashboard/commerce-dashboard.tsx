import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  PackageCheck,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/molecules/layout/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CommerceDashboardData,
  DashboardAction,
  DashboardMetric,
  DashboardTrendPoint,
} from "@/data/dashboard";
import { getOrderStatusBadgeClass } from "@/lib/utils/order-status";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

const METRIC_ICONS = [
  CircleDollarSign,
  ShoppingCart,
  TrendingUp,
  Boxes,
  PackageCheck,
  ClipboardList,
] as const;

function getMetricToneClass(tone: DashboardMetric["tone"]): string {
  if (tone === "positive") return "text-emerald-700";
  if (tone === "warning") return "text-amber-700";
  if (tone === "critical") return "text-red-700";
  return "text-muted-foreground";
}

function getActionToneClass(tone: DashboardAction["tone"]): string {
  if (tone === "critical") return "border-red-200 bg-red-50/70 text-red-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50/70 text-amber-800";
  return "border-blue-200 bg-blue-50/70 text-blue-800";
}

function MetricCard({ metric, index }: { metric: DashboardMetric; index: number }) {
  const Icon = METRIC_ICONS[index] ?? BarChart3;
  const card = (
    <Card className="h-full transition-colors hover:bg-muted/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{metric.label}</CardTitle>
        <Icon className={cn("h-4 w-4", getMetricToneClass(metric.tone))} />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tracking-tight">{metric.value}</p>
        <p className={cn("mt-1 text-xs", getMetricToneClass(metric.tone))}>
          {metric.detail}
        </p>
      </CardContent>
    </Card>
  );

  return metric.href ? (
    <Link href={metric.href} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

function TrendBars({ points }: { points: DashboardTrendPoint[] }) {
  const maxRevenue = Math.max(...points.map((point) => point.revenue), 1);
  const visiblePoints = points.length > 0
    ? points
    : [{ id: "empty", label: "No sales", revenue: 0, profit: 0, orders: 0 }];

  return (
    <div className="flex h-64 items-end gap-3 border-b border-l px-4 pb-8 pt-6">
      {visiblePoints.map((point) => {
        const revenueHeight = Math.max(6, (point.revenue / maxRevenue) * 180);
        const profitHeight = Math.max(4, (point.profit / maxRevenue) * 180);

        return (
          <div key={point.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-48 w-full items-end justify-center gap-1">
              <div
                className="w-4 rounded-t bg-blue-600"
                style={{ height: `${revenueHeight}px` }}
                title={`Revenue ${formatCurrency(point.revenue)}`}
              />
              <div
                className="w-4 rounded-t bg-emerald-500"
                style={{ height: `${profitHeight}px` }}
                title={`Profit ${formatCurrency(point.profit)}`}
              />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium">{point.label}</p>
              <p className="text-[11px] text-muted-foreground">{point.orders} orders</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CommerceDashboard({ dashboard }: { dashboard: CommerceDashboardData }) {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Commerce Control Dashboard"
        description="Cash, orders, inventory risk, and channel reconciliation in one place."
      >
        <Button variant="outline" asChild>
          <Link href="/inventory/sync">
            <RefreshCw className="mr-2 h-4 w-4" />
            Stock Sync
          </Link>
        </Button>
        <Button asChild>
          <Link href="/orders">
            <ShoppingCart className="mr-2 h-4 w-4" />
            Orders
          </Link>
        </Button>
      </PageHeader>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {dashboard.metrics.map((metric, index) => (
          <MetricCard key={metric.label} metric={metric} index={index} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(360px,0.85fr)_minmax(520px,1fr)_minmax(420px,0.95fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>What needs attention first</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Actionable work ranked by operational impact.
                </p>
              </div>
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.actions.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  No urgent dashboard actions
                </div>
                <p className="mt-1 text-emerald-700">
                  Stock sync, returns, feeds, and listing mapping have no active blockers.
                </p>
              </div>
            ) : (
              dashboard.actions.map((action, index) => (
                <div
                  key={action.title}
                  className={cn("rounded-lg border p-3", getActionToneClass(action.tone))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold">
                          {index + 1}
                        </span>
                        <h3 className="font-semibold">{action.title}</h3>
                      </div>
                      <p className="mt-2 text-sm leading-5 opacity-85">{action.description}</p>
                    </div>
                    <span className="text-2xl font-bold">{action.count.toLocaleString("en-IN")}</span>
                  </div>
                  <Button variant="link" className="mt-2 h-auto p-0 font-semibold" asChild>
                    <Link href={action.href}>
                      {action.cta}
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Sales and profit trend</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Revenue and gross profit from the last 7 days.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
                  Revenue
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                  Profit
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TrendBars points={dashboard.trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Channel performance</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sales, mapping coverage, and reconciliation health.
                </p>
              </div>
              <PackageSearch className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.channelPerformance.length === 0 ? (
              <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                Connect a channel to see sales, listings, and sync health.
              </p>
            ) : (
              dashboard.channelPerformance.map((channel) => (
                <div key={channel.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: channel.color }}
                        />
                        <h3 className="truncate font-semibold">{channel.name}</h3>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {channel.typeName} · {channel.orderCount} orders · {formatCurrency(channel.revenue)}
                      </p>
                    </div>
                    <Badge variant="outline">{formatPercent(channel.mappingCoveragePercent)} mapped</Badge>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-blue-600"
                      style={{ width: `${channel.mappingCoveragePercent}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <span>{channel.totalListings.toLocaleString("en-IN")} listings</span>
                    <span>{channel.pendingSyncCount.toLocaleString("en-IN")} sync reviews</span>
                    <span>{channel.failedFeedCount + channel.failedSyncCount} failures</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Orders needing work</CardTitle>
            <p className="text-sm text-muted-foreground">
              Current operational load by order status.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.orderWork.map((item) => (
                  <TableRow key={item.status}>
                    <TableCell>
                      <Link href={item.href} className="font-medium hover:underline">
                        {item.label}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono">{item.count}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory risk</CardTitle>
            <p className="text-sm text-muted-foreground">
              Available stock is on hand minus reserved units.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                label: "Stockout risk",
                value: dashboard.inventoryRisk.stockoutRiskCount,
                detail: "Low stock with recent sales",
                tone: "text-red-700",
              },
              {
                label: "Low stock SKUs",
                value: dashboard.inventoryRisk.lowStockCount,
                detail: "At or below reorder level",
                tone: "text-amber-700",
              },
              {
                label: "Slow-moving SKUs",
                value: dashboard.inventoryRisk.slowMovingCount,
                detail: `${formatCurrency(dashboard.inventoryRisk.slowMovingValue)} tied up`,
                tone: "text-blue-700",
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                </div>
                <span className={cn("text-3xl font-bold", item.tone)}>{item.value}</span>
              </div>
            ))}
            <Button variant="outline" className="w-full" asChild>
              <Link href="/inventory">
                Review inventory
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top products by profit</CardTitle>
            <p className="text-sm text-muted-foreground">
              Last 30 days, ranked by estimated gross profit.
            </p>
          </CardHeader>
          <CardContent>
            {dashboard.topProducts.length === 0 ? (
              <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                No mapped product sales found in the last 30 days.
              </p>
            ) : (
              <div className="space-y-3">
                {dashboard.topProducts.map((product) => (
                  <Link
                    key={product.id}
                    href={`/products/${product.id}`}
                    className="block rounded-lg border p-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{product.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {product.sku ?? "No SKU"} · {product.availableQuantity} available
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(product.profit)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatPercent(product.marginPercent)} margin
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent orders</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Latest channel orders with value and status.
            </p>
          </div>
          <Button variant="ghost" asChild>
            <Link href="/orders">
              View all
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.recentOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                    No recent orders.
                  </TableCell>
                </TableRow>
              ) : (
                dashboard.recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/orders/${order.id}`} className="text-blue-600 hover:underline">
                        {order.externalOrderId}
                      </Link>
                    </TableCell>
                    <TableCell>{order.channelName ?? "Unknown channel"}</TableCell>
                    <TableCell>
                      <Badge className={cn(getOrderStatusBadgeClass(order.status))}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(order.totalAmount, order.currency ?? "INR")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
