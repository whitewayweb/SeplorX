import { db, type QueryClient } from "@/db";
import { products } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";

export interface MissingCostAuditQuery {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface MissingCostAuditRow {
  channelId: number;
  channelName: string;
  channelType: string;
  externalProductId: string | null;
  channelProductId: number | null;
  channelProductName: string | null;
  channelSku: string | null;
  itemTitle: string | null;
  itemSku: string | null;
  mappedProductId: number | null;
  mappedProductName: string | null;
  mappedProductSku: string | null;
  orderCount: number;
  lineItems: number;
  units: number;
  revenue: string;
  firstPurchasedAt: Date | null;
  lastPurchasedAt: Date | null;
  issue: "missing_mapping" | "mapped_without_cost" | "unmatched_channel_product";
  totalCount: number;
}

export interface MissingCostAuditResult {
  rows: MissingCostAuditRow[];
  totalCount: number;
  totals: {
    rowCount: number;
    revenue: string;
    lineItems: number;
    orderCount: number;
  };
}

export interface ProductMappingOption {
  id: number;
  name: string;
  sku: string | null;
  isBundle: boolean;
}

export async function getMissingCostAudit(
  userId: number,
  query: MissingCostAuditQuery = {},
  tx: QueryClient = db,
): Promise<MissingCostAuditResult> {
  const limit = Math.max(1, Math.min(query.limit ?? 25, 100));
  const offset = Math.max(0, query.offset ?? 0);
  const search = query.search?.trim();
  const searchFilter = search
    ? sql`AND (
        COALESCE(grouped."externalProductId", '') ILIKE ${`%${search}%`}
        OR COALESCE(grouped."channelProductName", '') ILIKE ${`%${search}%`}
        OR COALESCE(grouped."channelSku", '') ILIKE ${`%${search}%`}
        OR COALESCE(grouped."itemTitle", '') ILIKE ${`%${search}%`}
        OR COALESCE(grouped."itemSku", '') ILIKE ${`%${search}%`}
        OR COALESCE(grouped."mappedProductName", '') ILIKE ${`%${search}%`}
        OR COALESCE(grouped."mappedProductSku", '') ILIKE ${`%${search}%`}
      )`
    : sql``;

  const rows = await tx.execute(sql`
    WITH missing_items AS (
      SELECT
        c.id AS "channelId",
        c.name AS "channelName",
        c.channel_type AS "channelType",
        COALESCE(
          NULLIF(soi.raw_data->>'ASIN', ''),
          NULLIF(soi.raw_data->>'variation_id', ''),
          NULLIF(soi.raw_data->>'product_id', ''),
          NULLIF(soi.sku, '')
        ) AS "externalProductId",
        soi.product_id AS "mappedProductId",
        p.name AS "mappedProductName",
        p.sku AS "mappedProductSku",
        soi.title AS "itemTitle",
        soi.sku AS "itemSku",
        soi.quantity AS "quantity",
        COALESCE(soi.price::numeric * soi.quantity, 0) AS "revenue",
        so.id AS "orderId",
        so.purchased_at AS "purchasedAt"
      FROM sales_order_items soi
      JOIN sales_orders so ON so.id = soi.order_id
      JOIN channels c ON c.id = so.channel_id
      LEFT JOIN products p ON p.id = soi.product_id
      WHERE c.user_id = ${userId}
        AND so.status IN ('pending', 'processing', 'on-hold', 'packed', 'shipped', 'delivered')
        AND soi.unit_cost IS NULL
    ),
    grouped AS (
      SELECT
        mi."channelId",
        mi."channelName",
        mi."channelType",
        mi."externalProductId",
        cp.id AS "channelProductId",
        cp.name AS "channelProductName",
        cp.sku AS "channelSku",
        COALESCE(mi."itemTitle", cp.name) AS "itemTitle",
        mi."itemSku",
        mi."mappedProductId",
        mi."mappedProductName",
        mi."mappedProductSku",
        COUNT(DISTINCT mi."orderId")::int AS "orderCount",
        COUNT(*)::int AS "lineItems",
        SUM(mi."quantity")::int AS "units",
        COALESCE(SUM(mi."revenue"), 0)::numeric(12,2) AS "revenue",
        MIN(mi."purchasedAt") AS "firstPurchasedAt",
        MAX(mi."purchasedAt") AS "lastPurchasedAt",
        CASE
          WHEN mi."mappedProductId" IS NOT NULL THEN 'mapped_without_cost'
          WHEN cp.id IS NULL THEN 'unmatched_channel_product'
          ELSE 'missing_mapping'
        END AS "issue"
      FROM missing_items mi
      LEFT JOIN channel_products cp
        ON cp.channel_id = mi."channelId"
        AND cp.external_id = mi."externalProductId"
      GROUP BY
        mi."channelId",
        mi."channelName",
        mi."channelType",
        mi."externalProductId",
        cp.id,
        cp.name,
        cp.sku,
        COALESCE(mi."itemTitle", cp.name),
        mi."itemSku",
        mi."mappedProductId",
        mi."mappedProductName",
        mi."mappedProductSku"
    ),
    filtered AS (
      SELECT *
      FROM grouped
      WHERE 1 = 1
      ${searchFilter}
    ),
    totals AS (
      SELECT
        COUNT(*)::int AS "totalCount",
        COALESCE(SUM("revenue"), 0)::numeric(12,2) AS "totalRevenue",
        COALESCE(SUM("lineItems"), 0)::int AS "totalLineItems",
        COALESCE(SUM("orderCount"), 0)::int AS "totalOrderCount"
      FROM filtered
    )
    SELECT
      filtered.*,
      totals."totalCount",
      totals."totalRevenue",
      totals."totalLineItems",
      totals."totalOrderCount"
    FROM filtered
    CROSS JOIN totals
    ORDER BY
      filtered."revenue" DESC,
      filtered."lineItems" DESC,
      filtered."channelProductName" ASC NULLS LAST
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const typedRows = rows as unknown as Array<MissingCostAuditRow & {
    totalRevenue: string;
    totalLineItems: number;
    totalOrderCount: number;
  }>;
  const firstRow = typedRows[0];

  return {
    rows: typedRows.map((row) => ({
      channelId: row.channelId,
      channelName: row.channelName,
      channelType: row.channelType,
      externalProductId: row.externalProductId,
      channelProductId: row.channelProductId,
      channelProductName: row.channelProductName,
      channelSku: row.channelSku,
      itemTitle: row.itemTitle,
      itemSku: row.itemSku,
      mappedProductId: row.mappedProductId,
      mappedProductName: row.mappedProductName,
      mappedProductSku: row.mappedProductSku,
      orderCount: row.orderCount,
      lineItems: row.lineItems,
      units: row.units,
      revenue: row.revenue,
      firstPurchasedAt: row.firstPurchasedAt,
      lastPurchasedAt: row.lastPurchasedAt,
      issue: row.issue,
      totalCount: row.totalCount,
    })),
    totalCount: firstRow?.totalCount ?? 0,
    totals: {
      rowCount: firstRow?.totalCount ?? 0,
      revenue: firstRow?.totalRevenue ?? "0.00",
      lineItems: firstRow?.totalLineItems ?? 0,
      orderCount: firstRow?.totalOrderCount ?? 0,
    },
  };
}

export async function getProductMappingOptions(
  tx: QueryClient = db,
): Promise<ProductMappingOption[]> {
  return tx
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      isBundle: products.isBundle,
    })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(asc(products.name));
}
