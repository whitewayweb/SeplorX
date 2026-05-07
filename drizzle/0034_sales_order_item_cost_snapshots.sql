ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "unit_cost" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "cost_source" varchar(50);--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "cost_captured_at" timestamp;--> statement-breakpoint

UPDATE "sales_order_items" soi
SET
  "unit_cost" = p."purchase_price",
  "cost_source" = 'current_cost_backfill',
  "cost_captured_at" = now()
FROM "products" p
WHERE soi."product_id" = p."id"
  AND soi."unit_cost" IS NULL
  AND p."is_bundle" = false
  AND p."purchase_price" IS NOT NULL;
--> statement-breakpoint

WITH bundle_costs AS (
  SELECT
    pb."bundle_product_id" AS "product_id",
    sum(pb."quantity"::numeric * component."purchase_price"::numeric)::numeric(12, 2) AS "unit_cost",
    count(pb."id")::int AS "component_count",
    count(pb."id") FILTER (WHERE component."purchase_price" IS NULL)::int AS "missing_component_cost_count"
  FROM "product_bundles" pb
  INNER JOIN "products" component ON component."id" = pb."component_product_id"
  GROUP BY pb."bundle_product_id"
)
UPDATE "sales_order_items" soi
SET
  "unit_cost" = bundle_costs."unit_cost",
  "cost_source" = 'current_cost_backfill',
  "cost_captured_at" = now()
FROM bundle_costs
INNER JOIN "products" bundle ON bundle."id" = bundle_costs."product_id"
WHERE soi."product_id" = bundle_costs."product_id"
  AND soi."unit_cost" IS NULL
  AND bundle."is_bundle" = true
  AND bundle_costs."component_count" > 0
  AND bundle_costs."missing_component_cost_count" = 0;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "sales_order_items_unit_cost_idx" ON "sales_order_items" USING btree ("unit_cost");
