import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { QueryClient } from "@/db";
import { productBundles, products, salesOrderItems, salesOrders } from "@/db/schema";

export type SalesOrderItemCostSource =
  | "product_purchase_price"
  | "bundle_component_cost"
  | "current_cost_backfill";

export interface SalesOrderItemCostSnapshot {
  unitCost: string | null;
  costSource: SalesOrderItemCostSource | null;
  costCapturedAt: Date | null;
}

export async function resolveSalesOrderItemCostSnapshot(
  tx: QueryClient,
  productId: number | undefined | null,
  source: SalesOrderItemCostSource = "product_purchase_price",
): Promise<SalesOrderItemCostSnapshot> {
  if (!productId) return missingCostSnapshot();

  const [product] = await tx
    .select({
      purchasePrice: products.purchasePrice,
      isBundle: products.isBundle,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) return missingCostSnapshot();

  if (!product.isBundle) {
    return product.purchasePrice
      ? capturedCostSnapshot(product.purchasePrice, source)
      : missingCostSnapshot();
  }

  const [bundleCost] = await tx
    .select({
      componentCount: sql<number>`count(${productBundles.id})::int`,
      missingComponentCostCount: sql<number>`count(${productBundles.id}) filter (
        where ${products.purchasePrice} is null
      )::int`,
      unitCost: sql<string>`coalesce(sum(
        ${productBundles.quantity}::numeric * ${products.purchasePrice}::numeric
      ), 0)::numeric(12,2)`,
    })
    .from(productBundles)
    .innerJoin(products, eq(productBundles.componentProductId, products.id))
    .where(eq(productBundles.bundleProductId, productId));

  if (
    !bundleCost ||
    bundleCost.componentCount === 0 ||
    bundleCost.missingComponentCostCount > 0
  ) {
    return missingCostSnapshot();
  }

  return capturedCostSnapshot(
    bundleCost.unitCost,
    source === "current_cost_backfill" ? source : "bundle_component_cost",
  );
}

export async function backfillSalesOrderItemsForChannelMapping(
  tx: QueryClient,
  channelId: number,
  externalProductId: string,
  productId: number,
): Promise<number> {
  const costSnapshot = await resolveSalesOrderItemCostSnapshot(
    tx,
    productId,
    "current_cost_backfill",
  );

  const rows = await tx
    .select({ id: salesOrderItems.id })
    .from(salesOrderItems)
    .innerJoin(salesOrders, eq(salesOrderItems.orderId, salesOrders.id))
    .where(
      and(
        eq(salesOrders.channelId, channelId),
        isNull(salesOrderItems.productId),
        or(
          eq(salesOrderItems.sku, externalProductId),
          sql`${salesOrderItems.rawData}->>'ASIN' = ${externalProductId}`,
          sql`${salesOrderItems.rawData}->>'variation_id' = ${externalProductId}`,
          sql`${salesOrderItems.rawData}->>'product_id' = ${externalProductId}`,
        ),
      ),
    );

  for (const row of rows) {
    await tx
      .update(salesOrderItems)
      .set({
        productId,
        unitCost: costSnapshot.unitCost,
        costSource: costSnapshot.costSource,
        costCapturedAt: costSnapshot.costCapturedAt,
      })
      .where(eq(salesOrderItems.id, row.id));
  }

  return rows.length;
}

function capturedCostSnapshot(
  unitCost: string,
  costSource: SalesOrderItemCostSource,
): SalesOrderItemCostSnapshot {
  return {
    unitCost,
    costSource,
    costCapturedAt: new Date(),
  };
}

function missingCostSnapshot(): SalesOrderItemCostSnapshot {
  return {
    unitCost: null,
    costSource: null,
    costCapturedAt: null,
  };
}
