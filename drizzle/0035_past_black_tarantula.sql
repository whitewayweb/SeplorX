CREATE TYPE "public"."finance_amount_role" AS ENUM('principal', 'tax', 'shipping_revenue', 'discount', 'order_fee_revenue', 'marketplace_fee', 'payment_fee', 'withholding', 'refund', 'adjustment', 'other');--> statement-breakpoint
CREATE TYPE "public"."finance_sync_status" AS ENUM('pending', 'synced', 'no_data', 'failed', 'not_supported');--> statement-breakpoint
CREATE TABLE "sales_order_finance_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"finance_event_id" integer NOT NULL,
	"order_item_id" integer,
	"external_item_id" varchar(255),
	"sku" varchar(255),
	"amount_role" "finance_amount_role" NOT NULL,
	"code" varchar(100) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(10),
	"quantity" integer,
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_order_finance_components" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales_order_finance_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"dedupe_key" varchar(255) NOT NULL,
	"external_event_id" varchar(255),
	"event_type" varchar(100) NOT NULL,
	"event_status" varchar(100),
	"posted_at" timestamp,
	"source_api_version" varchar(100) NOT NULL,
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_order_finance_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales_order_finance_syncs" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"status" "finance_sync_status" DEFAULT 'pending' NOT NULL,
	"source" varchar(100) NOT NULL,
	"last_attempt_at" timestamp,
	"synced_at" timestamp,
	"last_error_code" varchar(100),
	"last_error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_order_finance_syncs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales_order_finance_components" ADD CONSTRAINT "sales_order_finance_components_finance_event_id_sales_order_finance_events_id_fk" FOREIGN KEY ("finance_event_id") REFERENCES "public"."sales_order_finance_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_finance_components" ADD CONSTRAINT "sales_order_finance_components_order_item_id_sales_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."sales_order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_finance_events" ADD CONSTRAINT "sales_order_finance_events_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_finance_events" ADD CONSTRAINT "sales_order_finance_events_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_finance_syncs" ADD CONSTRAINT "sales_order_finance_syncs_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_finance_syncs" ADD CONSTRAINT "sales_order_finance_syncs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_order_finance_components_event_idx" ON "sales_order_finance_components" USING btree ("finance_event_id");--> statement-breakpoint
CREATE INDEX "sales_order_finance_components_item_idx" ON "sales_order_finance_components" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "sales_order_finance_components_role_idx" ON "sales_order_finance_components" USING btree ("amount_role");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_order_finance_events_dedupe_unique" ON "sales_order_finance_events" USING btree ("channel_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "sales_order_finance_events_order_idx" ON "sales_order_finance_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sales_order_finance_events_channel_idx" ON "sales_order_finance_events" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "sales_order_finance_events_posted_idx" ON "sales_order_finance_events" USING btree ("posted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_order_finance_syncs_order_unique" ON "sales_order_finance_syncs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sales_order_finance_syncs_channel_idx" ON "sales_order_finance_syncs" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "sales_order_finance_syncs_status_idx" ON "sales_order_finance_syncs" USING btree ("status");--> statement-breakpoint
WITH woo_orders AS (
	SELECT
		so.id AS order_id,
		so.channel_id,
		so.external_order_id,
		so.raw_data,
		(
			coalesce(jsonb_array_length(coalesce(so.raw_data->'line_items', '[]'::jsonb)), 0) > 0
			OR coalesce(jsonb_array_length(coalesce(so.raw_data->'shipping_lines', '[]'::jsonb)), 0) > 0
			OR coalesce(jsonb_array_length(coalesce(so.raw_data->'fee_lines', '[]'::jsonb)), 0) > 0
			OR coalesce(jsonb_array_length(coalesce(so.raw_data->'refunds', '[]'::jsonb)), 0) > 0
			OR coalesce(NULLIF(so.raw_data->>'discount_total', '')::numeric, 0) <> 0
		) AS has_components
	FROM sales_orders so
	JOIN channels c ON c.id = so.channel_id
	WHERE c.channel_type = 'woocommerce'
		AND so.raw_data IS NOT NULL
)
INSERT INTO sales_order_finance_syncs (
	order_id,
	channel_id,
	status,
	source,
	last_attempt_at,
	synced_at,
	created_at,
	updated_at
)
SELECT
	order_id,
	channel_id,
	CASE WHEN has_components THEN 'synced'::finance_sync_status ELSE 'no_data'::finance_sync_status END,
	'woocommerce_order_payload',
	now(),
	CASE WHEN has_components THEN now() ELSE NULL END,
	now(),
	now()
FROM woo_orders
ON CONFLICT ("order_id") DO NOTHING;--> statement-breakpoint
WITH woo_orders AS (
	SELECT
		so.id AS order_id,
		so.channel_id,
		so.external_order_id,
		so.status,
		so.raw_data,
		so.synced_at AS posted_at
	FROM sales_orders so
	JOIN channels c ON c.id = so.channel_id
	WHERE c.channel_type = 'woocommerce'
		AND so.raw_data IS NOT NULL
		AND (
			coalesce(jsonb_array_length(coalesce(so.raw_data->'line_items', '[]'::jsonb)), 0) > 0
			OR coalesce(jsonb_array_length(coalesce(so.raw_data->'shipping_lines', '[]'::jsonb)), 0) > 0
			OR coalesce(jsonb_array_length(coalesce(so.raw_data->'fee_lines', '[]'::jsonb)), 0) > 0
			OR coalesce(jsonb_array_length(coalesce(so.raw_data->'refunds', '[]'::jsonb)), 0) > 0
			OR coalesce(NULLIF(so.raw_data->>'discount_total', '')::numeric, 0) <> 0
		)
)
INSERT INTO sales_order_finance_events (
	order_id,
	channel_id,
	dedupe_key,
	external_event_id,
	event_type,
	event_status,
	posted_at,
	source_api_version,
	raw_data,
	created_at,
	updated_at
)
SELECT
	order_id,
	channel_id,
	'woocommerce:' || external_order_id,
	external_order_id,
	'order_payload',
	status::text,
	posted_at,
	'woocommerce/wc-v3/orders',
	raw_data,
	now(),
	now()
FROM woo_orders
ON CONFLICT ("channel_id", "dedupe_key") DO NOTHING;--> statement-breakpoint
WITH woo_events AS (
	SELECT
		sofe.id AS finance_event_id,
		sofe.order_id,
		sofe.raw_data,
		so.currency
	FROM sales_order_finance_events sofe
	JOIN sales_orders so ON so.id = sofe.order_id
	JOIN channels c ON c.id = so.channel_id
	WHERE c.channel_type = 'woocommerce'
		AND sofe.source_api_version = 'woocommerce/wc-v3/orders'
),
components AS (
	SELECT
		we.finance_event_id,
		soi.id AS order_item_id,
		item.value->>'id' AS external_item_id,
		NULLIF(item.value->>'sku', '') AS sku,
		'principal'::finance_amount_role AS amount_role,
		'line_total' AS code,
		NULLIF(item.value->>'total', '')::numeric AS amount,
		we.currency,
		NULLIF(item.value->>'quantity', '')::integer AS quantity,
		item.value AS raw_data
	FROM woo_events we
	CROSS JOIN LATERAL jsonb_array_elements(coalesce(we.raw_data->'line_items', '[]'::jsonb)) item(value)
	LEFT JOIN sales_order_items soi
		ON soi.order_id = we.order_id
		AND soi.external_item_id = item.value->>'id'
	WHERE coalesce(NULLIF(item.value->>'total', '')::numeric, 0) <> 0

	UNION ALL

	SELECT
		we.finance_event_id,
		soi.id AS order_item_id,
		item.value->>'id' AS external_item_id,
		NULLIF(item.value->>'sku', '') AS sku,
		'tax'::finance_amount_role AS amount_role,
		'line_total_tax' AS code,
		NULLIF(item.value->>'total_tax', '')::numeric AS amount,
		we.currency,
		NULLIF(item.value->>'quantity', '')::integer AS quantity,
		item.value AS raw_data
	FROM woo_events we
	CROSS JOIN LATERAL jsonb_array_elements(coalesce(we.raw_data->'line_items', '[]'::jsonb)) item(value)
	LEFT JOIN sales_order_items soi
		ON soi.order_id = we.order_id
		AND soi.external_item_id = item.value->>'id'
	WHERE coalesce(NULLIF(item.value->>'total_tax', '')::numeric, 0) <> 0

	UNION ALL

	SELECT
		we.finance_event_id,
		NULL,
		NULL,
		NULL,
		'shipping_revenue'::finance_amount_role,
		'shipping_total',
		NULLIF(line.value->>'total', '')::numeric,
		we.currency,
		NULL,
		line.value
	FROM woo_events we
	CROSS JOIN LATERAL jsonb_array_elements(coalesce(we.raw_data->'shipping_lines', '[]'::jsonb)) line(value)
	WHERE coalesce(NULLIF(line.value->>'total', '')::numeric, 0) <> 0

	UNION ALL

	SELECT
		we.finance_event_id,
		NULL,
		NULL,
		NULL,
		'tax'::finance_amount_role,
		'shipping_total_tax',
		NULLIF(line.value->>'total_tax', '')::numeric,
		we.currency,
		NULL,
		line.value
	FROM woo_events we
	CROSS JOIN LATERAL jsonb_array_elements(coalesce(we.raw_data->'shipping_lines', '[]'::jsonb)) line(value)
	WHERE coalesce(NULLIF(line.value->>'total_tax', '')::numeric, 0) <> 0

	UNION ALL

	SELECT
		we.finance_event_id,
		NULL,
		NULL,
		NULL,
		'order_fee_revenue'::finance_amount_role,
		'fee_total',
		NULLIF(line.value->>'total', '')::numeric,
		we.currency,
		NULL,
		line.value
	FROM woo_events we
	CROSS JOIN LATERAL jsonb_array_elements(coalesce(we.raw_data->'fee_lines', '[]'::jsonb)) line(value)
	WHERE coalesce(NULLIF(line.value->>'total', '')::numeric, 0) <> 0

	UNION ALL

	SELECT
		we.finance_event_id,
		NULL,
		NULL,
		NULL,
		'tax'::finance_amount_role,
		'fee_total_tax',
		NULLIF(line.value->>'total_tax', '')::numeric,
		we.currency,
		NULL,
		line.value
	FROM woo_events we
	CROSS JOIN LATERAL jsonb_array_elements(coalesce(we.raw_data->'fee_lines', '[]'::jsonb)) line(value)
	WHERE coalesce(NULLIF(line.value->>'total_tax', '')::numeric, 0) <> 0

	UNION ALL

	SELECT
		we.finance_event_id,
		NULL,
		NULL,
		NULL,
		'discount'::finance_amount_role,
		'discount_total',
		-abs(NULLIF(we.raw_data->>'discount_total', '')::numeric),
		we.currency,
		NULL,
		jsonb_build_object('discount_total', we.raw_data->>'discount_total')
	FROM woo_events we
	WHERE coalesce(NULLIF(we.raw_data->>'discount_total', '')::numeric, 0) <> 0

	UNION ALL

	SELECT
		we.finance_event_id,
		NULL,
		refund.value->>'id',
		NULL,
		'refund'::finance_amount_role,
		'refund_total',
		-abs(NULLIF(refund.value->>'total', '')::numeric),
		we.currency,
		NULL,
		refund.value
	FROM woo_events we
	CROSS JOIN LATERAL jsonb_array_elements(coalesce(we.raw_data->'refunds', '[]'::jsonb)) refund(value)
	WHERE coalesce(NULLIF(refund.value->>'total', '')::numeric, 0) <> 0
)
INSERT INTO sales_order_finance_components (
	finance_event_id,
	order_item_id,
	external_item_id,
	sku,
	amount_role,
	code,
	amount,
	currency,
	quantity,
	raw_data
)
SELECT
	finance_event_id,
	order_item_id,
	external_item_id,
	sku,
	amount_role,
	code,
	amount,
	currency,
	quantity,
	raw_data
FROM components;
