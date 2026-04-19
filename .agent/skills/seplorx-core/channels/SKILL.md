---
name: channels
description: >
  SeplorX e-commerce channel integrations — adding channels, stock sync, order sync,
  webhook handling, and product publishing. Use when integrating a new sales channel,
  working with order-driven stock management, or extending channel capabilities.
  Covers ChannelDefinition registry, ChannelHandler interface, OAuth flow, webhook setup,
  product sync, channel_products cache, product publishing pipeline, and stock reservations.
metadata:
  author: SeplorX
  version: "2.0"
---

# Adding a New Channel to SeplorX

## Channels vs Apps — Key Distinction

| | Apps | Channels |
|---|---|---|
| Examples | Delhivery, FedEx, Razorpay | WooCommerce, Shopify, Amazon |
| Purpose | Shipping/payment providers | Order source integrations |
| Instances | 1 per user | Many per user (multi-store) |
| Auth | API keys | OAuth or API key wizard |
| DB table | `app_installations` | `channels` |

## Step 1 — Add to Channel Registry

Add to `src/lib/channels/registry.ts`:

```typescript
{
  id: "shopify",                    // unique slug — matches channelType varchar in DB
  name: "Shopify",
  description: "Connect your Shopify storefront to manage orders.",
  icon: "/channels/shopify.svg",    // null = placeholder icon
  authType: "oauth",                // "oauth" | "apikey"
  popular: true,
  available: true,                  // false = "Coming soon" overlay in UI
}
```

Place the SVG at `public/channels/{id}.svg`. **No DB migration needed** — `channelType` is a `varchar`.

Also add `"shopify"` to the `ChannelType` union in `src/lib/channels/types.ts`.

## Step 2 — Create the Handler File

Create `src/lib/channels/{id}/index.ts` implementing `ChannelHandler`:

```typescript
import type { ChannelHandler } from "@/lib/channels/types";

export const shopifyHandler: ChannelHandler = {
  id: "shopify",

  // Wizard step 4 config fields (for apikey auth channels)
  configFields: [
    { key: "storeUrl", label: "Store URL", type: "url", required: true },
    { key: "accessToken", label: "Access Token", type: "password", required: true },
  ],

  // OAuth channels: topics to subscribe to
  webhookTopics: ["orders/create", "orders/cancelled"],

  // Validate config before connecting
  validateConfig(config) {
    if (!config.storeUrl?.startsWith("https://")) return "Store URL must start with https://";
    return null;
  },

  // Build the OAuth redirect URL (OAuth channels)
  buildConnectUrl(channelId, config, appUrl) {
    return `https://${config.shop}/admin/oauth/authorize?client_id=...&redirect_uri=${appUrl}/api/channels/shopify/callback&state=${channelId}`;
  },

  // Parse the OAuth callback body to extract credentials
  parseCallback(body) {
    const params = new URLSearchParams(body);
    return {
      channelId: Number(params.get("state")),
      credentials: { accessToken: params.get("code")! },
    };
  },

  // Push stock update to channel (when SeplorX stock changes)
  async pushStock(storeUrl, credentials, externalProductId, quantity, parentId, sku, productType, rawData) {
    await fetch(`${storeUrl}/admin/api/2024-01/variants/${externalProductId}.json`, {
      method: "PUT",
      headers: { "X-Shopify-Access-Token": credentials.accessToken },
      body: JSON.stringify({ variant: { inventory_quantity: quantity } }),
    });
  },

  // Register webhooks after channel is connected
  async registerWebhooks(storeUrl, credentials, baseUrl) {
    // Call channel API to register webhooks, return secret
    return { secret: "generated-secret" };
  },

  // Process incoming webhook payload → return stock changes
  processWebhook(body, signature, topic, secret) {
    const order = JSON.parse(body);
    return order.line_items.map((item: any) => ({
      externalProductId: String(item.variant_id),
      quantityChange: -item.quantity,
    }));
  },

  // Optional: fetch products for AI mapping + product browser
  async fetchProducts(storeUrl, credentials, search) {
    // Call Shopify products API, return ExternalProduct[]
    return [];
  },
  // Optional: fetch orders from the channel and save them to SeplorX
  async fetchAndSaveOrders(userId, channelId) {
    // Call channel API, insert into sales_orders and sales_order_items
    return { fetched: 0, saved: 0 };
  },
};
```

Register the handler in `src/lib/channels/handlers.ts`:
```typescript
import { shopifyHandler } from "./shopify";
// add to the handlers map:
shopify: shopifyHandler,
```

## Step 3 — Complex Channels: Use the API Client Pattern

For channels with token refreshing, feed polling, or complex pagination (like Amazon SP-API), **don't stuff all logic into `index.ts`**:

1. Create `src/lib/channels/{id}/api/client.ts` — encapsulate all HTTP, token refresh, polling, parsing in a class
2. Keep `index.ts` as a thin adapter that instantiates the client and calls its high-level methods
3. Create `src/data/channels.ts` (or update it) for channel-specific JSONB extraction and DB convenience queries using the DAL pattern.

## Step 4 — OAuth Callback (OAuth channels only)

The generic callback route at `src/app/api/channels/[type]/callback/route.ts` handles all channel types. It calls `handler.parseCallback(body)` and:
1. Extracts `channelId` + `credentials` from the parsed result
2. Encrypts credentials via `encrypt()` from `src/lib/crypto.ts`
3. Updates `channels` row: `status = "connected"`, `credentials = encrypted`

> **Critical:** The callback must return **HTTP 200**, not a redirect. Some platforms (e.g. WooCommerce) treat any non-200 as failure. The platform handles the redirect to `return_url` itself.

The OAuth flow in detail:
```
1. User fills wizard → createChannel() → INSERT channels (status="pending") → returns channelId
2. Client builds OAuth URL with channelId embedded as state/user_id
3. window.location.assign(oauthUrl) → browser redirects to platform
4. User approves → platform POSTs to /api/channels/{type}/callback
5. Callback → atomic UPDATE WHERE status="pending" → sets "connected" + encrypted credentials
6. Platform redirects user to return_url (/channels?connected=1)
```

## Step 5 — Channel Capabilities

Declare capabilities in the `ChannelDefinition` registry entry or in a `config.ts`:

| Capability flag | What it unlocks |
|----------------|-----------------|
| `canFetchProducts: true` | "Auto-Map (AI)" button, product sync/browser |
| `canPushProductUpdates: true` | "Publish Updates" button on `/channels/[id]/publish` |
| `canPushStock: true` | Stock push after inventory transactions |
| `usesWebhooks: true` | "Register Webhooks" button on channel card |

## Step 6 — Product Sync (optional, for `canFetchProducts`)

Implement `fetchProducts(storeUrl, credentials, search?)` returning `ExternalProduct[]`. The `syncChannelProducts` Server Action will call it and upsert results into the `channel_products` cache via `upsertChannelProducts()`.

**`channel_products` cache columns:**
- `externalId` — platform's ID (WC product ID, ASIN, etc.)
- `name`, `sku` — top-level native columns (indexed) — never use JSONB extraction for these
- `stockQuantity` — native int column
- `rawData` JSONB — full platform payload (for channel-specific fields like `brand`, `category`, `price`)

**Scalable JSONB filtering:** Implement `extractSqlField(fieldName)` in `src/data/channels.ts` (or domain file). This keeps SQL extraction logic channel-local rather than in global `CASE` statements:
```typescript
// src/data/channels.ts
export function extractSqlField(fieldName: string) {
  if (fieldName === "brand") return sql`${channelProducts.rawData}->>'brand'`;
  return null;
}
```

## Step 7 — Product Publishing (optional, for `canPushProductUpdates`)

1. Set `capabilities.canPushProductUpdates = true` in the channel config
2. Implement `pushPendingUpdates(userId, channelId): Promise<ChannelPushSyncResult>` on the handler
3. The generic page, service, and action all work automatically — no further code changes

## Step 8 — Webhooks

After connecting, the user clicks "Register Webhooks" which calls `handler.registerWebhooks()`. Incoming webhooks arrive at:
```
POST /api/channels/{type}/webhook/{channelId}
```

**Two processing paths:**

1. **Order topics** (`order.created`, `order.updated`): The route calls `handler.parseWebhookOrder()` to get a `WebhookOrderEvent`, upserts the order into `sales_orders`, and calls `processOrderStockChange()` from `src/lib/stock/service.ts`. This handles reservations, commits, and releases based on status transitions.

2. **Legacy/non-order topics**: The route calls `handler.processWebhook()` → `WebhookStockChange[]` and applies direct stock changes.

**Implementing `parseWebhookOrder()`** (required for order-status-driven stock):
```typescript
parseWebhookOrder(body: string, signature: string, secret: string): WebhookOrderEvent | null {
  // 1. Verify HMAC signature
  // 2. Parse order payload
  // 3. Return { externalOrderId, status, lineItems, rawData, buyerName, ... }
}
```

**WooCommerce webhook topics:** `order.created` + `order.updated` only. WooCommerce has NO `order.cancelled` topic — cancellations arrive via `order.updated` with status change.

**Idempotency:** The webhook route checks for existing orders by `channelId + externalOrderId`. For existing orders, only status changes trigger stock processing.

## Step 9 — Order Syncing (optional)

If the channel supports pulling orders via API, implement `fetchAndSaveOrders(userId, channelId)`.
1. Fetch recent orders via the channel's REST/GraphQL API. Use `getLastOrderDate(channelId)` from your `queries.ts` to only fetch new orders.
2. Transform and insert into `salesOrders` and `salesOrderItems`.
3. **After each new order is saved**, call `processOrderStockChange()` to create stock reservations — **gated by `STOCK_CUTOFF_DATE`**:

```typescript
const { processOrderStockChange, STOCK_CUTOFF_DATE } = await import("@/lib/stock/service");
if (savedOrder.purchasedAt && savedOrder.purchasedAt >= STOCK_CUTOFF_DATE) {
  await processOrderStockChange(savedOrder.id, savedOrder.status, null, userId);
}
```

This is non-fatal — wrap in try/catch so order saving succeeds even if stock processing fails.

4. **Retroactive mapping pass**: After all orders are saved, query `salesOrderItems` where `productId IS NULL` for the channel. Re-attempt mapping via `channelProductMappings` and SKU fallback. When a product is successfully matched, also call `processOrderStockChange()` for that order (with the same `STOCK_CUTOFF_DATE` gate and `stockProcessed` guard).

## Step 10 — Stock Management Integration

Stock processing is handled by `src/lib/stock/service.ts`. The state machine follows this flow:

```
new order (pending/processing) → reserve stock
shipped → no change (still reserved)
delivered (completed) → commit: quantityOnHand -= qty, release reservation
cancelled/refunded/failed → release reservation
returned → mark for inspection → admin restocks or discards
```

**Stock cutoff date:** `STOCK_CUTOFF_DATE` (exported from `src/lib/stock/service.ts`) gates all order-driven stock processing. Orders before this date are imported for history but do NOT create reservations or deductions. This protects manually baselined stock and is shared across all channel handlers.

**Key files:**
- `src/lib/stock/service.ts` — `processOrderStockChange()`, `processReturnItem()`, `STOCK_CUTOFF_DATE`
- `src/data/stock.ts` — DAL queries (available qty, reservations, returns awaiting action)
- `src/db/schema.ts` — `stock_reservations` table, `reservedQuantity` on products

**Return/Discard workflow:**
- `processReturnAction()` server action in `src/app/(dashboard)/orders/actions.ts`
- `ReturnActionDialog` component in `src/components/organisms/orders/return-action-dialog.tsx`
- Per-item qty picker, restock/discard selector, notes field
- **Restock** adds `+quantity` to `quantityOnHand`, logs `return_restock` transaction
- **Discard** logs `-quantity` as `return_discard` (units written off, no stock recovery)
- Order-level `returnDisposition` is aggregated from item states: `restocked` (all), `discarded` (all), or `completed` (mixed)
- Order detail page shows return badges (order + item level) and "Process Return" button for returned orders

**Webhook error handling:**
- Signature/parse errors → 400/401 (non-retryable)
- Transient DB/server errors → 500 (retryable by the channel)
- Successful processing → 200

**Stock push:** When pushing stock to channels via `pushProductStockToChannels()`, the system pushes `availableQuantity` (= `quantityOnHand - reservedQuantity`), not raw `quantityOnHand`. This ensures reserved stock (from active orders) is excluded.

## Security

```typescript
// Always scope channel access to authenticated user
const userId = await getAuthenticatedUserId();
const channel = await getChannelForUser(userId, channelId);
if (!channel) notFound();  // 404 for both missing AND unauthorized
```

- Credentials are encrypted at rest (AES-256-GCM via `src/lib/crypto.ts`)
- Never send decrypted credentials to the client — redact or omit from page props
- Webhook secrets stored encrypted in `credentials.webhookSecret`
- **Webhook URL signature:** `encrypt(channelId)` is appended as `?sig=` to the delivery URL during registration. The webhook route decrypts it and verifies it matches the path channelId. No extra DB field needed — uses the existing `encrypt()`/`decrypt()` from `src/lib/crypto.ts`. Backward compatible — channels without `?sig=` skip the check.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/channels/registry.ts` | **Edit here** — add new channel definition |
| `src/lib/channels/types.ts` | `ChannelType` union, `ChannelHandler` interface, `ChannelDefinition` |
| `src/lib/channels/handlers.ts` | Handler map — register new handler here |
| `src/lib/channels/{id}/index.ts` | **Create this** — ChannelHandler implementation |
| `src/data/channels.ts` | **Edit here** — JSONB field extraction, channel-specific DB queries |
| `src/app/api/channels/[type]/callback/route.ts` | Generic OAuth callback — no edits needed |
| `src/app/api/channels/[type]/webhook/[channelId]/route.ts` | Webhook receiver — upserts orders + calls `processOrderStockChange()` |
| `src/lib/stock/service.ts` | Stock state machine — `processOrderStockChange()`, `processReturnItem()` |
| `src/data/stock.ts` | Stock DAL — `getAvailableQuantity()`, `getReservationsForOrder()` |
| `src/lib/channels/queries.ts` | Shared DAL — `getChannelForUser`, `upsertChannelProducts` |
| `src/lib/channels/{id}/queries.ts` | Channel-local DAL — `extractSqlField`, `getLastOrderDate`, `getBrands` |
| `src/data/inventory.ts` | Inventory DAL — `getRecentInventoryTransactions`, stock value, low stock |
| `public/channels/{id}.svg` | **Add this** — channel icon |

## Common Mistakes to Avoid

- ❌ Returning a redirect from the OAuth callback — must return HTTP 200
- ❌ Using `extractSqlField` for `name`, `sku`, or `stockQuantity` — these are top-level columns
- ❌ Adding `if (channelType === 'shopify')` in page/UI components — put logic in handler/registry
- ❌ Querying channels without `userId` scope in page components — always use `getChannelForUser()`
- ❌ Storing credentials unencrypted — always use `encrypt()` / `decrypt()` from `src/lib/crypto.ts`
- ❌ Using `getChannel(id)` in page components for sensitive routes — use `getChannelForUser(userId, id)`
- ❌ Directly manipulating `quantityOnHand` for order-driven changes — always use `processOrderStockChange()`
- ❌ Using `order.cancelled` as a WooCommerce webhook topic — it doesn't exist; cancellations come via `order.updated`
