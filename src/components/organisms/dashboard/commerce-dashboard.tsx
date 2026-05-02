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
import {
  DashboardMetricVisual,
  type MetricVisualType,
} from "@/components/organisms/dashboard/dashboard-metric-visual";
import { DashboardTrendChart } from "@/components/organisms/dashboard/dashboard-trend-chart";
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
} from "@/data/dashboard";
import { getOrderStatusBadgeClass } from "@/lib/utils/order-status";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

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

function MetricCard({
  metric,
  index,
  sparkValues,
}: {
  metric: DashboardMetric;
  index: number;
  sparkValues: number[];
}) {
  const Icon = METRIC_ICONS[index] ?? BarChart3;
  const visualTypes: MetricVisualType[] = ["line", "bars", "comparison", "inventory", "health", "queue"];
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
        <DashboardMetricVisual
          values={sparkValues}
          tone={metric.tone}
          type={visualTypes[index] ?? "bars"}
          valueText={metric.value}
        />
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

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function RangeSelector({ dashboard }: { dashboard: CommerceDashboardData }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background p-1">
      {dashboard.range.options.map((option) => (
        <Button
          key={option.days}
          variant={option.active ? "default" : "ghost"}
          size="sm"
          className="h-8"
          asChild
        >
          <Link href={option.href}>{option.label}</Link>
        </Button>
      ))}
    </div>
  );
}

function ProfitAndLossCard({ dashboard }: { dashboard: CommerceDashboardData }) {
  const rows = [
    {
      label: "Net sales",
      value: formatCurrency(dashboard.profitAndLoss.revenue),
      tone: "text-foreground",
    },
    {
      label: "Known-cost sales",
      value: formatCurrency(dashboard.profitAndLoss.knownCostRevenue),
      tone: "text-foreground",
    },
    {
      label: "Known cost of goods",
      value: `-${formatCurrency(dashboard.profitAndLoss.estimatedCost)}`,
      tone: "text-muted-foreground",
    },
    {
      label: "Known-cost gross profit",
      value: formatCurrency(dashboard.profitAndLoss.grossProfit),
      tone: "text-emerald-700",
    },
    {
      label: "Sales missing product cost",
      value: formatCurrency(dashboard.profitAndLoss.missingCostRevenue),
      tone: dashboard.profitAndLoss.missingCostRevenue > 0 ? "text-amber-700" : "text-muted-foreground",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profit and loss</CardTitle>
        <p className="text-sm text-muted-foreground">
          Known-cost P&L for the selected {dashboard.range.label}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className={cn("font-medium", row.tone)}>{row.value}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
          <div>
            <p className="text-muted-foreground">Gross margin</p>
            <p className="mt-1 font-semibold">
              {formatPercent(dashboard.profitAndLoss.grossMarginPercent)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">AOV</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(dashboard.profitAndLoss.averageOrderValue)}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground">Included orders</p>
            <p className="mt-1 font-semibold">
              {formatNumber(dashboard.profitAndLoss.orderCount)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CommerceDashboard({ dashboard }: { dashboard: CommerceDashboardData }) {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Commerce Control Dashboard"
        description={`Cash, orders, inventory risk, and channel reconciliation for the last ${dashboard.range.label}.`}
      >
        <RangeSelector dashboard={dashboard} />
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

      <section className="space-y-3">
        <SectionHeading
          title="Business snapshot"
          description="The current pulse across revenue, orders, stock, and work queues."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {dashboard.metrics.map((metric, index) => {
            const sparkValues = index === 1
              ? dashboard.trend.map((point) => point.orders)
              : index === 2
                ? dashboard.trend.map((point) => point.profit)
                : dashboard.trend.map((point) => point.revenue);

            return (
              <MetricCard
                key={metric.label}
                metric={metric}
                index={index}
                sparkValues={sparkValues.length > 0 ? sparkValues : [0]}
              />
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Financial performance"
          description="Sales, gross profit, margin, and cost view for the selected period."
        />
        <div className="grid gap-6 xl:grid-cols-[minmax(520px,1fr)_minmax(320px,0.45fr)]">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Sales and profit trend</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Revenue and known-cost gross profit from the last {dashboard.range.label}.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[var(--chart-1)]" />
                    Revenue
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[var(--chart-2)]" />
                    Known-cost profit
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <DashboardTrendChart points={dashboard.trend} />
            </CardContent>
          </Card>
          <ProfitAndLossCard dashboard={dashboard} />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Operational actions"
          description="Review queues and order states that need attention before they affect customers."
        />
        <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.85fr)_minmax(520px,1fr)]">
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
                    <span className="text-2xl font-bold">{formatNumber(action.count)}</span>
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
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Channels"
          description="Channel-only sales, mapping coverage, and reconciliation health."
        />
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
          <CardContent>
            {dashboard.channelPerformance.length === 0 ? (
              <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                Connect a channel to see sales, listings, and sync health.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {dashboard.channelPerformance.map((channel) => (
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
                    <span>{formatNumber(channel.totalListings)} listings</span>
                    <span>{formatNumber(channel.pendingSyncCount)} sync reviews</span>
                    <span>{channel.failedFeedCount + channel.failedSyncCount} failures</span>
                  </div>
                </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Inventory and products"
          description="Stock risk and product profitability for fulfillment and buying decisions."
        />
        <div className="grid gap-6 xl:grid-cols-2">
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
              Last {dashboard.range.label}, ranked by estimated gross profit.
            </p>
          </CardHeader>
          <CardContent>
            {dashboard.topProducts.length === 0 ? (
              <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                No mapped product sales found in the last {dashboard.range.label}.
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
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Recent order activity"
          description="Latest channel orders with value and status."
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent orders</CardTitle>
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
      </section>
    </div>
  );
}
