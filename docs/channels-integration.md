# Channels Integration

## Purpose

Channels are e-commerce order sources — storefronts from which orders are pulled into SeplorX. Users connect a WooCommerce store, Shopify store, Amazon account, etc., and orders sync automatically.

Channels are **distinct from Apps**:

| | Apps | Channels |
|---|---|---|
| Examples | Delhivery, FedEx, Razorpay | WooCommerce, Shopify, Amazon |
| Purpose | Shipping / payment providers | Order source integrations |
| Instances per type | 1 per user (unique constraint) | Many per user (multi-store) |
| Auth method | API keys / passwords (config fields) | OAuth (1-click authorization) |
| DB table | `app_installations` | `channels` |
| Row created | On "Install" click | Before OAuth redirect (`pending`) |
| Config storage | `config` JSONB (dynamic fields) | `credentials` JSONB (fixed keys) |

## Registry Pattern

Channel type definitions live in TypeScript. The database stores instances only.

```
Channel Registry (TypeScript)    → defines available channel types
channels table (PostgreSQL)      → one row per connected channel instance
```

### Adding a New Channel Type

Add one object to `src/lib/channels/registry.ts`:

```typescript
{
  id: "shopify",               // unique slug, matches channelType in DB
  name: "Shopify",
  description: "Connect your Shopify storefront to manage orders.",
  icon: "/channels/shopify.svg", // null to use placeholder icon
  authType: "oauth",           // "oauth" | "apikey"
  popular: true,               // shows in "Popular Channels" section
  available: true,             // false = "Coming soon" overlay in UI
}
```

Place the channel icon SVG at `public/channels/{id}.svg`.

No database migration is needed to add a new channel type. The `channelType` column is `varchar` — it holds whatever string the registry defines.

## Type Definitions (`src/lib/channels/types.ts`)

```typescript
type ChannelType = "woocommerce" | "shopify" | "amazon" | "custom";

interface ChannelDefinition {
  id: ChannelType;
  name: string;
  description: string;
  icon: string | null;       // path under /public/channels/, or null
  authType: "oauth" | "apikey";
  popular: boolean;
  available: boolean;        // gates UI access

  // Isomorphic fields (safe for Client Components)
  configFields?: ChannelConfigField[];
  capabilities?: ChannelCapabilities;
  validateConfig?: (config: Partial<Record<string, string>>) => string | null;
  buildConnectUrl?: (channelId: number, config: Record<string, string>, appUrl: string) => string;
}

type ChannelStatus = "pending" | "connected" | "disconnected";

interface ChannelInstance {
  id: number;
  channelType: string;
  name: string;              // user-defined (e.g. "hiyaautomotive.com")
  status: ChannelStatus;
  storeUrl: string | null;
  defaultPickupLocation: string | null;
  createdAt: Date | null;
  hasWebhooks: boolean;      // derived server-side from credentials.webhookSecret
}

// Returned by handler.fetchProducts() and stored in ChannelMappingPlan proposals
interface ExternalProduct {
  id: string;       // WooCommerce product ID as string
  name: string;
  sku?: string;
  stockQuantity?: number;
}
```

## WooCommerce OAuth Flow (1-Click Integration)

WooCommerce has a built-in REST API key creation endpoint that drives the 1-click flow.

### Step-by-step

```
1. User completes wizard (name, pickup location, store URL)
2. Client calls createChannel server action
   → INSERT channels row with status="pending"
   → Returns channelId
3. Client validates storeUrl protocol (http/https only), then builds WooCommerce authorize URL:
   {storeUrl}/wc-auth/v1/authorize
     ?app_name=SeplorX
     &scope=read_write
     &user_id={channelId}                    ← our internal row ID (WooCommerce echoes it back)
     &return_url={appUrl}/channels?connected=1
     &callback_url={appUrl}/api/channels/woocommerce/callback
4. window.location.assign(authorizeUrl)  (browser redirects to WordPress admin)
5. User clicks "Approve" in their WordPress admin
6. WooCommerce POSTs to callback_url with:
     consumer_key, consumer_secret, key_permissions, user_id
7. Callback route (/api/channels/woocommerce/callback):
   → Atomic UPDATE: SET status="connected", credentials={encrypted keys}
     WHERE id=channelId AND status="pending" (prevents race conditions + replay)
   → Returns HTTP 200  ← IMPORTANT: WooCommerce requires 200, not a redirect
8. WooCommerce redirects user to return_url (/channels?connected=1)
9. User sees "Store connected successfully" banner + channel with "Connected" badge
```

> **Why HTTP 200?** WooCommerce treats any non-200 response from the callback as failure and shows "An error occurred in the request." The server must return 200 — WooCommerce handles the redirect to `return_url` itself.

### Callback route

`src/app/api/channels/[type]/callback/route.ts` — generic public `POST` handler (routes to the correct `ChannelHandler` based on `[type]`).

WooCommerce sends `application/x-www-form-urlencoded` (not JSON). The handler reads `request.formData()`. Credentials are encrypted with `encrypt()` from `src/lib/crypto.ts` before being written to the `credentials` JSONB column.

The `user_id` parameter in the WooCommerce OAuth URL is a passthrough field — WooCommerce echoes it back unchanged in the callback body. We use it as our internal `channelId` to match the callback to the correct pending row.

### Local development

The callback URL must be publicly reachable by the WooCommerce server. In local development:

1. Run `ngrok http 3000` → get a URL like `https://abc123.ngrok-free.app`
2. Set `NEXT_PUBLIC_APP_URL=https://abc123.ngrok-free.app` in `.env.local`
3. The WooCommerce callback URL becomes: `https://abc123.ngrok-free.app/api/channels/woocommerce/callback`

**Simpler alternative (no WordPress needed):** Simulate the callback with curl after the wizard creates the pending row:

```bash
curl -X POST http://localhost:3000/api/channels/woocommerce/callback \
  -d "user_id=CHANNEL_ID&consumer_key=ck_test123&consumer_secret=cs_test456"
# Expect: HTTP 200 OK (callback returns 200, not a redirect)
```

This tests the full encrypt + atomic-update flow. Then navigate to `/channels?connected=1` to see the success banner.

## Add Channel Wizard (`src/components/channels/add-channel-wizard.tsx`)

A single Dialog with local `step` state (1–4). No URL routing per step.

| Step | Content |
|------|---------|
| 1 | Select channel type — grid of `ChannelDefinition` cards; unavailable ones show "Soon" badge |
| 2 | Channel name — user-defined label (e.g. "hiyaautomotive.com") |
| 3 | Default preference — default pickup location for orders from this channel |
| 4 | Connect — channel-specific OAuth/API config (WooCommerce: store URL + "Integrate in 1-Click") |

Step 4 calls `createChannel` server action, receives the new `channelId`, then redirects the browser to the WooCommerce authorize URL. The wizard does not poll or wait — the OAuth callback redirects back to `/channels` when complete.

## Server Actions (`src/app/channels/actions.ts`)

| Action | What it does |
|--------|-------------|
| `createChannel` | INSERT channels row (status: pending), returns `{ channelId }` |
| `resetChannelStatus` | Reset status="pending", wipe credentials — used by "Complete Setup" / "Reconnect" buttons |
| `disconnectChannel` | UPDATE status="disconnected", wipes credentials JSONB |
| `deleteChannel` | DELETE the row entirely |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_URL` | Base URL for building callback_url and return_url in OAuth flow. Set to `http://localhost:3000` locally, production domain on Vercel. |
| `ENCRYPTION_KEY` | 64-char hex string (32 bytes) for AES-256-GCM encryption of OAuth credentials. Same key used by Apps. |

## Current Channel Types

| ID | Name | Auth | Available |
|----|------|------|-----------|
| woocommerce | WooCommerce | OAuth (1-click) | ✅ |
| shopify | Shopify | OAuth | 🚧 Coming soon |
| amazon | Amazon | API key | 🚧 Coming soon |
| custom | Custom | API key | 🚧 Coming soon |

---

## ChannelHandler Interface

All channel-specific logic lives in a `ChannelHandler` implementation per channel type (e.g. `src/lib/channels/woocommerce/index.ts`). The generic routes and registry only call through the interface — adding Shopify means creating one new file and registering it.

```typescript
interface ChannelHandler {
  readonly id: ChannelType;
  readonly configFields: ChannelConfigField[];   // wizard step 4 inputs
  readonly webhookTopics: readonly string[];      // e.g. ["order.created", "order.cancelled"]
  validateConfig(config): string | null;          // returns error message or null
  buildConnectUrl(channelId, config, appUrl): string;
  parseCallback(body: string): { channelId, credentials } | null;
  pushStock(storeUrl, credentials, externalProductId, quantity): Promise<void>;
  registerWebhooks(storeUrl, credentials, baseUrl): Promise<{ secret: string }>;
  processWebhook(body, signature, topic, secret): WebhookStockChange[];
  fetchProducts?(storeUrl, credentials, search?): Promise<ExternalProduct[]>;  // optional
}
```

**Retrieve a handler (Server-side only):**
```typescript
import { getChannelHandler } from "@/lib/channels/handlers";
const handler = getChannelHandler("woocommerce");  // returns null for unknown types
```

**Adding a new topic to WooCommerce webhooks** (e.g. `order.completed`): add the topic to `webhookTopics` and handle it in `processWebhook` inside `woocommerce/index.ts`. No changes to the generic webhook route.

**`fetchProducts` is optional** — channels that don't support product listing (e.g. Amazon) simply don't implement it. The product mapping dialog shows "Channel does not support product listing" for those.

---

## Channel Product Mappings

The `channel_product_mappings` table links SeplorX products to external (WooCommerce) products. This is the bridge for both stock push (SeplorX → WooCommerce) and order pull (WooCommerce → SeplorX).

### Key design: many-to-one

```
SeplorX product "Yellow Buffer"
  └── WooCommerce product 55 "Series A"     ← same channel
  └── WooCommerce product 56 "Series B"     ← same channel
  └── WooCommerce product 57 "4pc Pack"     ← same channel
```

The unique constraint is on `(channel_id, external_product_id)` — one WC product maps to at most one SeplorX product per channel. One SeplorX product can have multiple WC mappings.

**Push direction (SeplorX → WooCommerce):** After stock changes (invoice received, manual adjustment), query all `channel_product_mappings WHERE product_id = X` → call `handler.pushStock()` for each row.

**Pull direction (WooCommerce → SeplorX):** Webhook fires for WC product ID 56 → query `WHERE channel_id = Y AND external_product_id = '56'` → single SeplorX product → decrement stock.

### Schema

```sql
channel_product_mappings (
  id                  SERIAL PRIMARY KEY,
  channel_id          INTEGER → channels.id (CASCADE),
  product_id          INTEGER → products.id (CASCADE),
  external_product_id VARCHAR(100),
  label               VARCHAR(255),   -- optional annotation, auto-filled from WC product name
  created_at          TIMESTAMP,
  UNIQUE(channel_id, external_product_id)
)
```

### Webhooks

After a channel is connected, register webhooks via the "Register Webhooks" button on `/channels`. This:
1. Calls `handler.registerWebhooks()` → creates `order.created` + `order.cancelled` webhooks in WooCommerce
2. Stores the HMAC secret (encrypted) in `channels.credentials.webhookSecret`
3. Stores WooCommerce webhook IDs in credentials for future cleanup

Webhook URL: `POST /api/channels/{type}/webhook/{channelId}` — one URL per channel instance.

**Loop prevention:** Webhook-triggered transactions use `referenceType: "woocommerce_order"`. The stock push logic only runs for `referenceType: "purchase_invoice"` and manual adjustments — never for WooCommerce orders.

**Idempotency:** Before inserting an inventory transaction, the webhook route checks if a transaction already exists with the same `referenceType + referenceId`. Duplicate webhooks are silently skipped.

---

## Product Mapping UI & Agent Flow

### Manual mapping (`/products/[id]` → Channel Sync card)

Each product detail page shows a "Channel Sync" card with one section per connected channel:
- List of existing mappings (WC product name, Remove button)
- "Add Products" button → opens `AddMappingDialog`

**`AddMappingDialog`** fetches live WC products via `fetchChannelProducts(channelId, productId)` (server action) and shows each WC product in one of three states:

| State | UI |
|-------|-----|
| `unmapped` | Checkbox (selectable) + product name + SKU badge |
| `mapped_here` | Checked checkbox (disabled) + green "Already mapped" badge |
| `mapped_other` | Unchecked (disabled) + amber "Mapped to [Other Product]" badge |

Select one or more unmapped products → "Add X Products" → `saveChannelMappings` server action → `ON CONFLICT DO NOTHING` insert.

### AI auto-mapping (`/channels` → "Auto-Map (AI)" button)

```
1. User clicks "Auto-Map (AI)" on a connected channel
   → POST /api/agents/channel-mapping { channelId }

2. channel-mapping-agent.ts (Gemini 2.0 Flash):
   a. getSeplorxProducts()       → all active SeplorX products
   b. getChannelProducts({ channelId })  → unmapped WC products only
   c. Match by name + SKU (high/medium/low confidence)
   d. proposeChannelMappings()   → writes agent_actions row (status: pending_approval)
   → Returns { taskId }

3. /channels page shows ChannelMappingApprovalCard:
   - Table: SeplorX product ↔ WC product, confidence badge, rationale
   - Collapsible agent reasoning
   - Unmatched WC products (informational — suggests creating SeplorX products)

4. User clicks "Approve & Map N Products"
   → approveChannelMappings(taskId) server action
   → Bulk INSERT into channel_product_mappings ON CONFLICT DO NOTHING
   → agent_actions.status = 'executed'
   → revalidatePath("/channels") + revalidatePath("/products")
```

**Confidence levels:** exact SKU match = high, name contains/starts-with = medium, fuzzy = low.

**All-already-mapped guard:** If `getChannelProducts` returns 0 unmapped products, the agent returns `{ message: "All products are already mapped." }` and no `agent_actions` row is created.

**One SeplorX product → many WC products** is intentional — variants (4pc pack, Series A/B) all map to the same SeplorX product for unified stock management.
