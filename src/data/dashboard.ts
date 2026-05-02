import { db } from "@/db";
import {
  channelFeeds,
  channelProductMappings,
  channelProducts,
  channels,
  products,
  salesOrderItems,
  salesOrders,
  stockReservations,
} from "@/db/schema";
import { getPendingStockSyncProductCount } from "@/data/products";
import { channelRegistry, getChannelById } from "@/lib/channels/registry";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

const ACTIVE_REVENUE_STATUSES = [
  "pending",
  "processing",
  "on-hold",
  "packed",
  "shipped",
  "delivered",
] as const;

const ACTIONABLE_ORDER_STATUSES = [
  { status: "pending", label: "Pending review", href: "/orders?status=pending" },
  { status: "processing", label: "Ready to pack", href: "/orders?status=processing" },
  { status: "packed", label: "Packed, dispatch next", href: "/orders?status=packed" },
  { status: "on-hold", label: "On hold", href: "/orders?status=on-hold" },
  { status: "returned", label: "Returns to inspect", href: "/orders?status=returned" },
] as const;

const STOCK_PUSH_SUPPORTED_CHANNEL_TYPES = channelRegistry
  .filter((channel) => channel.capabilities?.canPushStock)
  .map((channel) => channel.id);

const DAY_MS = 24 * 60 * 60 * 1000;

export const DASHBOARD_RANGES = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

export type DashboardRangeDays = (typeof DASHBOARD_RANGES)[number]["days"];

export interface DashboardRangeOption {
  days: DashboardRangeDays;
  label: string;
  href: string;
  active: boolean;
}

interface DashboardWindow {
  todayStart: string;
  periodStart: string;
  previousPeriodStart: string;
  thirtyDaysAgo: string;
  sixtyDaysAgo: string;
  days: DashboardRangeDays;
  label: string;
}

export interface DashboardMetric {
  label: string;
  value: string;
  detail: string;
  tone: "default" | "positive" | "warning" | "critical";
  href?: string;
  chart?: {
    type: "sparkline" | "bar" | "gauge" | "stacked";
    data: number[]; // For sparkline/bar, it's an array of values. For gauge, it's [percent]. For stacked, it's [val1, val2, ...].
    colors?: string[];
  };
}

export interface DashboardAction {
  title: string;
  description: string;
  count: number;
  href: string;
  cta: string;
  tone: "warning" | "critical" | "info";
}

export interface DashboardTrendPoint {
  id: string;
  label: string;
  date: string;
  revenue: number;
  profit: number;
  missingCostRevenue: number;
  orders: number;
}

export interface DashboardOrderWorkItem {
  label: string;
  status: string;
  count: number;
  value: number;
  href: string;
}

export interface DashboardChannelPerformance {
  id: number;
  name: string;
  channelType: string;
  typeName: string;
  color: string;
  revenue: number;
  orderCount: number;
  totalListings: number;
  mappedListings: number;
  mappingCoveragePercent: number;
  pendingSyncCount: number;
  failedSyncCount: number;
  failedFeedCount: number;
}

export interface DashboardInventoryRisk {
  activeProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  stockoutRiskCount: number;
  slowMovingCount: number;
  slowMovingValue: number;
}

export interface DashboardProductPerformance {
  id: number;
  name: string;
  sku: string | null;
  revenue: number;
  profit: number;
  marginPercent: number;
  availableQuantity: number;
}

export interface DashboardRecentOrder {
  id: number;
  externalOrderId: string;
  status: string;
  totalAmount: number;
  currency: string | null;
  channelName: string | null;
}

export interface CommerceDashboardData {
  range: {
    days: DashboardRangeDays;
    label: string;
    options: DashboardRangeOption[];
  };
  metrics: DashboardMetric[];
  actions: DashboardAction[];
  trend: DashboardTrendPoint[];
  orderWork: DashboardOrderWorkItem[];
  channelPerformance: DashboardChannelPerformance[];
  inventoryRisk: DashboardInventoryRisk;
  profitAndLoss: DashboardProfitAndLoss;
  topProducts: DashboardProductPerformance[];
  recentOrders: DashboardRecentOrder[];
}

interface SalesSummary {
  revenueToday: number;
  revenuePeriod: number;
  revenuePreviousPeriod: number;
  ordersToday: number;
  ordersPeriod: number;
  knownCostRevenuePeriod: number;
  grossProfitPeriod: number;
  estimatedCostPeriod: number;
  missingCostRevenue: number;
}

export interface DashboardProfitAndLoss {
  revenue: number;
  knownCostRevenue: number;
  estimatedCost: number;
  grossProfit: number;
  missingCostRevenue: number;
  grossMarginPercent: number;
  averageOrderValue: number;
  orderCount: number;
}

interface OperationalSummary {
  reservedUnits: number;
  unmappedListings: number;
  returnsAwaitingAction: number;
  failedFeeds: number;
  inventoryValue: number;
}

export function parseDashboardRange(value: string | string[] | undefined): DashboardRangeDays {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number(rawValue);
  const option = DASHBOARD_RANGES.find((range) => range.days === parsed);
  return option?.days ?? 7;
}

function getDashboardWindow(days: DashboardRangeDays): DashboardWindow {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const label = DASHBOARD_RANGES.find((range) => range.days === days)?.label ?? "7 days";

  return {
    todayStart: todayStart.toISOString(),
    periodStart: new Date(now.getTime() - days * DAY_MS).toISOString(),
    previousPeriodStart: new Date(now.getTime() - days * 2 * DAY_MS).toISOString(),
    thirtyDaysAgo: new Date(now.getTime() - 30 * DAY_MS).toISOString(),
    sixtyDaysAgo: new Date(now.getTime() - 60 * DAY_MS).toISOString(),
    days,
    label,
  };
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}



function buildActions(
  summary: OperationalSummary,
  risk: DashboardInventoryRisk,
  pendingStockSyncProducts: number,
): DashboardAction[] {
  const actions: DashboardAction[] = [
    {
      title: "Map channel listings",
      description: "Unmapped listings cannot participate in stock sync, order attribution, or product profitability.",
      count: summary.unmappedListings,
      href: "/products",
      cta: "Bulk map",
      tone: summary.unmappedListings > 100 ? "critical" : "warning",
    },
    {
      title: "Restock at-risk SKUs",
      description: "Products at or below reorder level need review before they block order fulfillment.",
      count: risk.lowStockCount,
      href: "/inventory",
      cta: "Review stock",
      tone: risk.stockoutRiskCount > 0 ? "critical" : "warning",
    },
    {
      title: "Resolve stock sync review",
      description: "Compare SeplorX available stock against channel stock before pushing updates.",
      count: pendingStockSyncProducts,
      href: "/inventory/sync",
      cta: "Review queue",
      tone: "info",
    },
    {
      title: "Inspect returned orders",
      description: "Returned items need restock or discard decisions before inventory is accurate.",
      count: summary.returnsAwaitingAction,
      href: "/orders?status=returned",
      cta: "Inspect returns",
      tone: "warning",
    },
    {
      title: "Fix failed channel feeds",
      description: "Failed feeds can leave external listings out of date until they are reviewed.",
      count: summary.failedFeeds,
      href: "/channels",
      cta: "Open channels",
      tone: "critical",
    },
  ];

  return actions
    .filter((action) => action.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

async function getSalesSummary(userId: number, window: DashboardWindow): Promise<SalesSummary> {
  const [ordersRow, profitRow] = await Promise.all([
    db
      .select({
        revenueToday: sql<string>`coalesce(sum(${salesOrders.totalAmount}) filter (
          where ${salesOrders.purchasedAt} >= ${window.todayStart}
        ), 0)`,
        revenuePeriod: sql<string>`coalesce(sum(${salesOrders.totalAmount}) filter (
          where ${salesOrders.purchasedAt} >= ${window.periodStart}
        ), 0)`,
        revenuePreviousPeriod: sql<string>`coalesce(sum(${salesOrders.totalAmount}) filter (
          where ${salesOrders.purchasedAt} >= ${window.previousPeriodStart}
            and ${salesOrders.purchasedAt} < ${window.periodStart}
        ), 0)`,
        ordersToday: sql<number>`count(*) filter (
          where ${salesOrders.purchasedAt} >= ${window.todayStart}
        )::int`,
        ordersPeriod: sql<number>`count(*) filter (
          where ${salesOrders.purchasedAt} >= ${window.periodStart}
        )::int`,
      })
      .from(salesOrders)
      .innerJoin(channels, eq(salesOrders.channelId, channels.id))
      .where(and(eq(channels.userId, userId), inArray(salesOrders.status, ACTIVE_REVENUE_STATUSES))),
    db
      .select({
        knownCostRevenuePeriod: sql<string>`coalesce(sum(
          ${salesOrderItems.price}::numeric * ${salesOrderItems.quantity}
        ) filter (where ${products.purchasePrice} is not null), 0)`,
        grossProfitPeriod: sql<string>`coalesce(sum(
          (${salesOrderItems.price}::numeric - ${products.purchasePrice}) * ${salesOrderItems.quantity}
        ) filter (where ${products.purchasePrice} is not null), 0)`,
        estimatedCostPeriod: sql<string>`coalesce(sum(
          ${products.purchasePrice} * ${salesOrderItems.quantity}
        ) filter (where ${products.purchasePrice} is not null), 0)`,
        missingCostRevenue: sql<string>`coalesce(sum(
          ${salesOrderItems.price}::numeric * ${salesOrderItems.quantity}
        ) filter (where ${products.purchasePrice} is null), 0)`,
      })
      .from(salesOrderItems)
      .innerJoin(salesOrders, eq(salesOrderItems.orderId, salesOrders.id))
      .innerJoin(channels, eq(salesOrders.channelId, channels.id))
      .leftJoin(products, eq(salesOrderItems.productId, products.id))
      .where(
        and(
          eq(channels.userId, userId),
          inArray(salesOrders.status, ACTIVE_REVENUE_STATUSES),
          sql`${salesOrders.purchasedAt} >= ${window.periodStart}`,
        ),
      ),
  ]);

  const row = ordersRow[0];
  const profit = profitRow[0];

  return {
    revenueToday: toNumber(row?.revenueToday),
    revenuePeriod: toNumber(row?.revenuePeriod),
    revenuePreviousPeriod: toNumber(row?.revenuePreviousPeriod),
    ordersToday: toNumber(row?.ordersToday),
    ordersPeriod: toNumber(row?.ordersPeriod),
    knownCostRevenuePeriod: toNumber(profit?.knownCostRevenuePeriod),
    grossProfitPeriod: toNumber(profit?.grossProfitPeriod),
    estimatedCostPeriod: toNumber(profit?.estimatedCostPeriod),
    missingCostRevenue: toNumber(profit?.missingCostRevenue),
  };
}

async function getOperationalSummary(userId: number): Promise<OperationalSummary> {
  const [
    reservedRows,
    unmappedRows,
    returnsRows,
    failedFeedRows,
    inventoryRows,
  ] = await Promise.all([
    db
      .select({
        count: sql<number>`coalesce(sum(${stockReservations.quantity}), 0)::int`,
      })
      .from(stockReservations)
      .innerJoin(salesOrders, eq(stockReservations.orderId, salesOrders.id))
      .innerJoin(channels, eq(salesOrders.channelId, channels.id))
      .where(and(eq(channels.userId, userId), eq(stockReservations.status, "active"))),
    db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(channelProducts)
      .innerJoin(channels, eq(channelProducts.channelId, channels.id))
      .where(
        and(
          eq(channels.userId, userId),
          eq(channels.status, "connected"),
          sql`not exists (
            select 1
            from ${channelProductMappings} m
            where m.channel_id = ${channelProducts.channelId}
              and m.external_product_id = ${channelProducts.externalId}
          )`,
        ),
      ),
    db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(salesOrders)
      .innerJoin(channels, eq(salesOrders.channelId, channels.id))
      .where(
        and(
          eq(channels.userId, userId),
          eq(salesOrders.returnDisposition, "pending_inspection"),
        ),
      ),
    db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(channelFeeds)
      .innerJoin(channels, eq(channelFeeds.channelId, channels.id))
      .where(and(eq(channels.userId, userId), eq(channelFeeds.status, "fatal"))),
    db
      .select({
        totalValue: sql<string>`coalesce(sum(${products.quantityOnHand}::numeric * coalesce(${products.purchasePrice}, 0)), 0)`,
      })
      .from(products)
      .where(eq(products.isActive, true)),
  ]);

  return {
    reservedUnits: toNumber(reservedRows[0]?.count),
    unmappedListings: toNumber(unmappedRows[0]?.count),
    returnsAwaitingAction: toNumber(returnsRows[0]?.count),
    failedFeeds: toNumber(failedFeedRows[0]?.count),
    inventoryValue: toNumber(inventoryRows[0]?.totalValue),
  };
}

async function getInventoryRisk(window: DashboardWindow): Promise<DashboardInventoryRisk> {
  const [row] = await db
    .select({
      activeProducts: sql<number>`count(*)::int`,
      lowStockCount: sql<number>`count(*) filter (
        where greatest(0, ${products.quantityOnHand} - ${products.reservedQuantity}) <= ${products.reorderLevel}
      )::int`,
      outOfStockCount: sql<number>`count(*) filter (
        where greatest(0, ${products.quantityOnHand} - ${products.reservedQuantity}) <= 0
      )::int`,
      stockoutRiskCount: sql<number>`count(*) filter (
        where greatest(0, ${products.quantityOnHand} - ${products.reservedQuantity}) <= ${products.reorderLevel}
          and exists (
            select 1
            from ${salesOrderItems}
            inner join ${salesOrders}
              on "sales_order_items"."order_id" = "sales_orders"."id"
            where "sales_order_items"."product_id" = "products"."id"
              and "sales_orders"."purchased_at" >= ${window.thirtyDaysAgo}
          )
      )::int`,
      slowMovingCount: sql<number>`count(*) filter (
        where ${products.reorderLevel} > 0
          and greatest(0, ${products.quantityOnHand} - ${products.reservedQuantity}) > (${products.reorderLevel} * 4)
          and not exists (
            select 1
            from ${salesOrderItems}
            inner join ${salesOrders}
              on "sales_order_items"."order_id" = "sales_orders"."id"
            where "sales_order_items"."product_id" = "products"."id"
              and "sales_orders"."purchased_at" >= ${window.sixtyDaysAgo}
          )
      )::int`,
      slowMovingValue: sql<string>`coalesce(sum(
        greatest(0, ${products.quantityOnHand} - ${products.reservedQuantity})::numeric * coalesce(${products.purchasePrice}, 0)
      ) filter (
        where ${products.reorderLevel} > 0
          and greatest(0, ${products.quantityOnHand} - ${products.reservedQuantity}) > (${products.reorderLevel} * 4)
          and not exists (
            select 1
            from ${salesOrderItems}
            inner join ${salesOrders}
              on "sales_order_items"."order_id" = "sales_orders"."id"
            where "sales_order_items"."product_id" = "products"."id"
              and "sales_orders"."purchased_at" >= ${window.sixtyDaysAgo}
          )
      ), 0)`,
    })
    .from(products)
    .where(eq(products.isActive, true));

  return {
    activeProducts: toNumber(row?.activeProducts),
    lowStockCount: toNumber(row?.lowStockCount),
    outOfStockCount: toNumber(row?.outOfStockCount),
    stockoutRiskCount: toNumber(row?.stockoutRiskCount),
    slowMovingCount: toNumber(row?.slowMovingCount),
    slowMovingValue: toNumber(row?.slowMovingValue),
  };
}

async function getTrend(userId: number, window: DashboardWindow): Promise<DashboardTrendPoint[]> {
  const [ordersRows, profitRows] = await Promise.all([
    db
      .select({
        day: sql<string>`trim(to_char(${salesOrders.purchasedAt}, 'Dy'))`,
        sortDay: sql<string>`to_char(${salesOrders.purchasedAt}, 'YYYY-MM-DD')`,
        revenue: sql<string>`coalesce(sum(${salesOrders.totalAmount}), 0)`,
        orders: sql<number>`count(*)::int`,
      })
      .from(salesOrders)
      .innerJoin(channels, eq(salesOrders.channelId, channels.id))
      .where(
        and(
          eq(channels.userId, userId),
          sql`${salesOrders.purchasedAt} >= ${window.periodStart}`,
          inArray(salesOrders.status, ACTIVE_REVENUE_STATUSES),
        ),
      )
      .groupBy(sql`trim(to_char(${salesOrders.purchasedAt}, 'Dy'))`, sql`to_char(${salesOrders.purchasedAt}, 'YYYY-MM-DD')`),

    db
      .select({
        sortDay: sql<string>`to_char(${salesOrders.purchasedAt}, 'YYYY-MM-DD')`,
        profit: sql<string>`coalesce(sum(
          (${salesOrderItems.price}::numeric - ${products.purchasePrice}) * ${salesOrderItems.quantity}
        ) filter (where ${products.purchasePrice} is not null), 0)`,
        missingCostRevenue: sql<string>`coalesce(sum(
          ${salesOrderItems.price}::numeric * ${salesOrderItems.quantity}
        ) filter (where ${products.purchasePrice} is null), 0)`,
      })
      .from(salesOrderItems)
      .innerJoin(salesOrders, eq(salesOrderItems.orderId, salesOrders.id))
      .innerJoin(channels, eq(salesOrders.channelId, channels.id))
      .leftJoin(products, eq(salesOrderItems.productId, products.id))
      .where(
        and(
          eq(channels.userId, userId),
          sql`${salesOrders.purchasedAt} >= ${window.periodStart}`,
          inArray(salesOrders.status, ACTIVE_REVENUE_STATUSES),
        ),
      )
      .groupBy(sql`to_char(${salesOrders.purchasedAt}, 'YYYY-MM-DD')`),
  ]);

  const map = new Map<string, DashboardTrendPoint>();

  for (const row of ordersRows) {
    map.set(row.sortDay, {
      id: row.sortDay,
      label: `${row.day} ${row.sortDay.slice(5).replace("-", "/")}`,
      date: row.sortDay,
      revenue: toNumber(row.revenue),
      profit: 0,
      missingCostRevenue: 0,
      orders: toNumber(row.orders),
    });
  }

  for (const row of profitRows) {
    const existing = map.get(row.sortDay);
    if (existing) {
      existing.profit = toNumber(row.profit);
      existing.missingCostRevenue = toNumber(row.missingCostRevenue);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function getOrderWork(userId: number): Promise<DashboardOrderWorkItem[]> {
  const rows = await db
    .select({
      status: salesOrders.status,
      count: sql<number>`count(*)::int`,
      value: sql<string>`coalesce(sum(${salesOrders.totalAmount}), 0)`,
    })
    .from(salesOrders)
    .innerJoin(channels, eq(salesOrders.channelId, channels.id))
    .where(
      and(
        eq(channels.userId, userId),
        inArray(salesOrders.status, ACTIONABLE_ORDER_STATUSES.map((item) => item.status)),
      ),
    )
    .groupBy(salesOrders.status);

  return ACTIONABLE_ORDER_STATUSES.map((item) => {
    const row = rows.find((candidate) => candidate.status === item.status);
    return {
      label: item.label,
      status: item.status,
      count: toNumber(row?.count),
      value: toNumber(row?.value),
      href: item.href,
    };
  });
}

async function getChannelPerformance(
  userId: number,
  window: DashboardWindow,
): Promise<DashboardChannelPerformance[]> {
  const rows = await db
    .select({
      id: channels.id,
      name: channels.name,
      channelType: channels.channelType,
      revenue: sql<string>`coalesce(sum(${salesOrders.totalAmount}) filter (
        where ${salesOrders.purchasedAt} >= ${window.periodStart}
          and ${inArray(salesOrders.status, ACTIVE_REVENUE_STATUSES)}
      ), 0)`,
      orderCount: sql<number>`count(distinct ${salesOrders.id}) filter (
        where ${salesOrders.purchasedAt} >= ${window.periodStart}
          and ${inArray(salesOrders.status, ACTIVE_REVENUE_STATUSES)}
      )::int`,
      totalListings: sql<number>`coalesce((
        select count(*)::int
        from ${channelProducts}
        where ${channelProducts.channelId} = ${channels.id}
      ), 0)`,
      mappedListings: sql<number>`coalesce((
        select count(*)::int
        from ${channelProductMappings}
        where ${channelProductMappings.channelId} = ${channels.id}
      ), 0)`,
      pendingSyncCount: sql<number>`coalesce((
        select count(*)::int
        from ${channelProductMappings}
        where ${channelProductMappings.channelId} = ${channels.id}
          and ${channelProductMappings.syncStatus} = 'pending_update'
          and ${inArray(channels.channelType, STOCK_PUSH_SUPPORTED_CHANNEL_TYPES)}
      ), 0)`,
      failedSyncCount: sql<number>`coalesce((
        select count(*)::int
        from ${channelProductMappings}
        where ${channelProductMappings.channelId} = ${channels.id}
          and ${channelProductMappings.syncStatus} = 'failed'
          and ${inArray(channels.channelType, STOCK_PUSH_SUPPORTED_CHANNEL_TYPES)}
      ), 0)`,
      failedFeedCount: sql<number>`coalesce((
        select count(*)::int
        from ${channelFeeds}
        where ${channelFeeds.channelId} = ${channels.id}
          and ${channelFeeds.status} = 'fatal'
      ), 0)`,
    })
    .from(channels)
    .leftJoin(salesOrders, eq(salesOrders.channelId, channels.id))
    .where(and(eq(channels.userId, userId), eq(channels.status, "connected")))
    .groupBy(channels.id)
    .orderBy(desc(sql`coalesce(sum(${salesOrders.totalAmount}), 0)`));

  return rows.map((row) => {
    const definition = getChannelById(row.channelType);
    const totalListings = toNumber(row.totalListings);
    const mappedListings = toNumber(row.mappedListings);

    return {
      id: row.id,
      name: row.name,
      channelType: row.channelType,
      typeName: definition?.name ?? row.channelType,
      color: definition?.color ?? "#64748b",
      revenue: toNumber(row.revenue),
      orderCount: toNumber(row.orderCount),
      totalListings,
      mappedListings,
      mappingCoveragePercent: totalListings > 0 ? Math.min(100, (mappedListings / totalListings) * 100) : 100,
      pendingSyncCount: toNumber(row.pendingSyncCount),
      failedSyncCount: toNumber(row.failedSyncCount),
      failedFeedCount: toNumber(row.failedFeedCount),
    };
  });
}

async function getTopProducts(
  userId: number,
  window: DashboardWindow,
): Promise<DashboardProductPerformance[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      revenue: sql<string>`coalesce(sum(${salesOrderItems.price}::numeric * ${salesOrderItems.quantity}), 0)`,
      profit: sql<string>`coalesce(sum(
        (${salesOrderItems.price}::numeric - ${products.purchasePrice}) * ${salesOrderItems.quantity}
      ) filter (where ${products.purchasePrice} is not null), 0)`,
      availableQuantity: sql<number>`greatest(0, ${products.quantityOnHand} - ${products.reservedQuantity})::int`,
    })
    .from(salesOrderItems)
    .innerJoin(salesOrders, eq(salesOrderItems.orderId, salesOrders.id))
    .innerJoin(channels, eq(salesOrders.channelId, channels.id))
    .innerJoin(products, eq(salesOrderItems.productId, products.id))
    .where(
      and(
        eq(channels.userId, userId),
        sql`${salesOrders.purchasedAt} >= ${window.periodStart}`,
        inArray(salesOrders.status, ACTIVE_REVENUE_STATUSES),
      ),
    )
    .groupBy(products.id)
    .orderBy(desc(sql`coalesce(sum(
      (${salesOrderItems.price}::numeric - ${products.purchasePrice}) * ${salesOrderItems.quantity}
    ) filter (where ${products.purchasePrice} is not null), 0)`))
    .limit(5);

  return rows.map((row) => {
    const revenue = toNumber(row.revenue);
    const profit = toNumber(row.profit);

    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      revenue,
      profit,
      marginPercent: revenue > 0 ? (profit / revenue) * 100 : 0,
      availableQuantity: toNumber(row.availableQuantity),
    };
  });
}

async function getRecentOrders(userId: number): Promise<DashboardRecentOrder[]> {
  const rows = await db
    .select({
      id: salesOrders.id,
      externalOrderId: salesOrders.externalOrderId,
      status: salesOrders.status,
      totalAmount: salesOrders.totalAmount,
      currency: salesOrders.currency,
      channelName: channels.name,
    })
    .from(salesOrders)
    .innerJoin(channels, eq(salesOrders.channelId, channels.id))
    .where(eq(channels.userId, userId))
    .orderBy(desc(sql`coalesce(${salesOrders.purchasedAt}, ${salesOrders.createdAt})`), desc(salesOrders.id))
    .limit(6);

  return rows.map((row) => ({
    id: row.id,
    externalOrderId: row.externalOrderId,
    status: row.status,
    totalAmount: toNumber(row.totalAmount),
    currency: row.currency,
    channelName: row.channelName,
  }));
}

export async function getCommerceDashboardData(
  userId: number,
  options: { rangeDays?: DashboardRangeDays } = {},
): Promise<CommerceDashboardData> {
  const window = getDashboardWindow(options.rangeDays ?? 7);

  const [
    sales,
    operational,
    inventoryRisk,
    pendingStockSyncProducts,
    trend,
    orderWork,
    channelPerformance,
    topProducts,
    recentOrders,
  ] = await Promise.all([
    getSalesSummary(userId, window),
    getOperationalSummary(userId),
    getInventoryRisk(window),
    getPendingStockSyncProductCount(userId),
    getTrend(userId, window),
    getOrderWork(userId),
    getChannelPerformance(userId, window),
    getTopProducts(userId, window),
    getRecentOrders(userId),
  ]);

  const grossMarginPercent = sales.knownCostRevenuePeriod > 0
    ? (sales.grossProfitPeriod / sales.knownCostRevenuePeriod) * 100
    : 0;
  const averageOrderValue = sales.ordersPeriod > 0
    ? sales.revenuePeriod / sales.ordersPeriod
    : 0;
  const profitAndLoss = {
    revenue: sales.revenuePeriod,
    knownCostRevenue: sales.knownCostRevenuePeriod,
    estimatedCost: sales.estimatedCostPeriod,
    grossProfit: sales.grossProfitPeriod,
    missingCostRevenue: sales.missingCostRevenue,
    grossMarginPercent,
    averageOrderValue,
    orderCount: sales.ordersPeriod,
  };
  const actionCount =
    operational.unmappedListings +
    pendingStockSyncProducts +
    operational.returnsAwaitingAction +
    operational.failedFeeds +
    inventoryRisk.lowStockCount;

  return {
    range: {
      days: window.days,
      label: window.label,
      options: DASHBOARD_RANGES.map((range) => ({
        ...range,
        href: range.days === 7 ? "/" : `/?range=${range.days}`,
        active: range.days === window.days,
      })),
    },
    metrics: [
      {
        label: "Revenue today",
        value: formatCurrency(sales.revenueToday),
        detail: `${formatCurrency(sales.revenuePeriod)} in the last ${window.label}`,
        tone: sales.revenueToday > 0 ? "positive" : "default",
        href: "/orders",
        chart: {
          type: "sparkline",
          data: trend.map((t) => t.revenue),
        },
      },
      {
        label: "Orders today",
        value: formatNumber(sales.ordersToday),
        detail: `${formatNumber(sales.ordersPeriod)} orders in the last ${window.label}`,
        tone: sales.ordersToday > 0 ? "positive" : "default",
        href: "/orders",
        chart: {
          type: "bar",
          data: trend.map((t) => t.orders),
        },
      },
      {
        label: "Known-cost profit",
        value: formatCurrency(sales.grossProfitPeriod),
        detail: `${formatPercent(grossMarginPercent)} margin, ${formatCurrency(sales.missingCostRevenue)} missing cost`,
        tone: grossMarginPercent > 0 ? "positive" : "default",
        chart: {
          type: "sparkline",
          data: trend.map((t) => t.profit),
        },
      },
      {
        label: "Cash in inventory",
        value: formatCurrency(operational.inventoryValue),
        detail: `${formatCurrency(inventoryRisk.slowMovingValue)} slow-moving stock`,
        tone: inventoryRisk.slowMovingValue > 0 ? "warning" : "default",
        href: "/inventory",
      },
      {
        label: "Stock health",
        value: `${inventoryRisk.activeProducts - inventoryRisk.lowStockCount}/${inventoryRisk.activeProducts}`,
        detail: `${inventoryRisk.lowStockCount} low stock, ${operational.reservedUnits} reserved units`,
        tone: inventoryRisk.lowStockCount > 0 ? "warning" : "positive",
        href: "/inventory",
        chart: {
          type: "gauge",
          data: [
            inventoryRisk.activeProducts > 0
              ? ((inventoryRisk.activeProducts - inventoryRisk.lowStockCount) / inventoryRisk.activeProducts) * 100
              : 100,
          ],
        },
      },
      {
        label: "Action queue",
        value: formatNumber(actionCount),
        detail: `${operational.failedFeeds + inventoryRisk.stockoutRiskCount} urgent blockers`,
        tone: actionCount > 0 ? "critical" : "positive",
        chart: {
          type: "stacked",
          data: [
            operational.failedFeeds + inventoryRisk.stockoutRiskCount, // Urgent
            inventoryRisk.lowStockCount + operational.unmappedListings, // Warning
            pendingStockSyncProducts + operational.returnsAwaitingAction, // Normal
          ],
          colors: ["var(--destructive)", "var(--chart-3)", "var(--chart-1)"],
        },
      },
    ],
    actions: buildActions(operational, inventoryRisk, pendingStockSyncProducts),
    trend,
    orderWork,
    channelPerformance,
    inventoryRisk,
    profitAndLoss,
    topProducts,
    recentOrders,
  };
}
