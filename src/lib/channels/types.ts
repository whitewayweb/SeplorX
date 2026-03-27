export type ChannelType = "woocommerce" | "shopify" | "amazon" | "custom";

export interface StandardizedProductRecord {
  name: string;
  sku: string;
  stockQuantity: string | number;
  brand: string;
  color: string;
  partNumber: string;
  manufacturer: string;
  description: string;
  itemTypeKw: string;
  category: string;
  price: string;
  itemCondition: string;
  pkgWeight: string;
  itemWeight: string;
  images: {
    link: string;
    variant?: string;
    width: string | number;
    height: string | number;
  }[];
  relationships: {
    type?: string;
    childAsins?: string[];
    parentAsins?: string[];
    variationTheme?: { theme: string };
  }[];
}

export interface ChannelDefinition {
  id: ChannelType;
  name: string;
  description: string;
  /** Path under /public/channels/, or null to show a placeholder icon */
  icon: string | null;
  authType: "oauth" | "apikey";
  popular: boolean;
  /** If true, channel is implemented and can be connected */
  available: boolean;

  // The following fields mirror ChannelHandler but belong to the definition
  // to be safely accessible in Client Components without pulling in server modules.
  configFields?: ChannelConfigField[];
  capabilities?: ChannelCapabilities;
  validateConfig?: (config: Partial<Record<string, string>>) => string | null;
  buildConnectUrl?: (
    channelId: number,
    config: Record<string, string>,
    appUrl: string,
  ) => string;
  /** Generate a public product link if available (e.g. Amazon DP link) */
  getProductUrl?: (
    externalId: string,
    credentials?: Record<string, string>,
    rawData?: unknown,
  ) => string | null;
  /** UI Hint for the connection step */
  connectionHint?: string;

  /**
   * Extract standardized fields from channel-specific rawData payload to be displayed
   * in the product details UI.
   */
   
  extractProductFields?: (
    rawData: Record<string, unknown>,
  ) => StandardizedProductRecord;
}

export type ChannelStatus = "pending" | "connected" | "disconnected";

export interface ChannelInstance {
  id: number;
  channelType: string;
  name: string;
  status: ChannelStatus;
  storeUrl: string | null;
  defaultPickupLocation: string | null;
  createdAt: Date | null;
  /** True if webhook credentials are registered for this channel (derived server-side) */
  hasWebhooks?: boolean;
  /** Number of products synced into the local cache for this channel */
  cachedProductCount: number;
}

// ─── Channel Handler (per-channel-type plugin interface) ─────────────────────

export interface ChannelConfigField {
  key: string;
  label: string;
  type: "url" | "text" | "password" | "select";
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  /** Render field half-width to fit 2 columns per row */
  halfWidth?: boolean;
}

export interface WebhookStockChange {
  externalProductId: string;
  /** Negative = sale_out, positive = return */
  quantity: number;
  type: "sale_out" | "return";
  /** Remote order ID (for idempotency) */
  referenceId: number;
  /** e.g. "woocommerce_order" */
  referenceType: string;
}

/**
 * Richer webhook event for order-status-driven stock changes.
 * Returned by processWebhook() for order.updated/order.created topics.
 * The webhook route uses this to call processOrderStockChange().
 */
export interface WebhookOrderEvent {
  externalOrderId: string;
  status: string;
  /** Parsed line items from the webhook payload */
  lineItems: Array<{
    externalProductId: string;
    variationId?: string;
    sku?: string;
    quantity: number;
    title?: string;
    price?: string;
    rawData: Record<string, unknown>;
  }>;
  /** Full raw order payload for storage */
  rawData: Record<string, unknown>;
  /** Buyer info parsed from the webhook */
  buyerName?: string | null;
  buyerEmail?: string | null;
  totalAmount?: string | null;
  currency?: string | null;
  purchasedAt?: Date | null;
}

export interface ExternalProduct {
  id: string;
  name: string;
  sku?: string;
  stockQuantity?: number;
  /** Product type returned by the channel (e.g. "simple", "variable", "variation") */
  type?: "simple" | "variable" | "variation";
  /** For variations: the parent variable product ID */
  parentId?: string;
  /** Complete raw payload from the channel API to be stored in the DB */
  rawPayload: Record<string, unknown>;
}

// Shared return type for pushPendingUpdates() across all channel handlers.
export interface ChannelPushSyncItemResult {
  externalProductId: string;
  success: boolean;
  error?: string;
}
export interface ChannelPushSyncResult {
  pushed: number;
  failed: number;
  results: ChannelPushSyncItemResult[];
}

export interface ChannelCapabilities {
  /** Can fetch a product list from the remote channel (used in Add Products drawer) */
  canFetchProducts: boolean;
  /** Can push stock quantity back to the remote channel */
  canPushStock: boolean;
  /**
   * Can push staged product detail updates (name, description, price, etc.)
   * directly to the remote channel's REST API.
   * If true, the channel should expose a /channels/[id]/sync page.
   */
  canPushProductUpdates: boolean;
  /**
   * Uses webhook-based event delivery (e.g. WooCommerce order webhooks).
   * If false, the "Register Webhooks" button is hidden in the UI.
   */
  usesWebhooks: boolean;
}

export interface ChannelHandler {
  readonly id: ChannelType;
  /** Config fields shown in the connect wizard (step 4) */
  readonly configFields: ChannelConfigField[];
  /** Declares which optional features this channel supports */
  readonly capabilities: ChannelCapabilities;
  /**
   * Webhook topics to register on the remote store.
   * Adding a new topic = add here + handle in processWebhook.
   * The generic webhook route is topic-agnostic and never needs to change.
   */
  readonly webhookTopics: readonly string[];

  /** Return an error message string, or null if valid */
  validateConfig(config: Partial<Record<string, string>>): string | null;

  /**
   * Fetch a list of products from the remote store.
   * Required when capabilities.canFetchProducts = true.
   * @param search - Optional search term to filter products
   */
  fetchProducts?(
    storeUrl: string,
    credentials: Record<string, string>,
    search?: string,
  ): Promise<ExternalProduct[]>;

  /** Build the OAuth/connect URL to redirect the user to */
  buildConnectUrl(
    channelId: number,
    config: Record<string, string>,
    appUrl: string,
  ): string;

  /**
   * Parse the raw OAuth callback body.
   * Returns { channelId, credentials } or null if the body is invalid.
   */
  parseCallback(
    body: string,
  ): { channelId: number; credentials: Record<string, string> } | null;

  /**
   * Push a stock quantity to a single external product.
   * Required when capabilities.canPushStock = true.
   */
  pushStock?(
    storeUrl: string,
    credentials: Record<string, string>,
    externalProductId: string,
    quantity: number,
    parentId?: string | null,
    sku?: string | null,
    productType?: string | null,
  ): Promise<void>;

  /**
   * Register all webhookTopics on the remote store.
   * Required when capabilities.usesWebhooks = true.
   * Returns the shared HMAC secret used to verify incoming webhook payloads.
   */
  registerWebhooks?(
    storeUrl: string,
    credentials: Record<string, string>,
    /** Base URL used to build delivery URLs, e.g. `https://app.com/api/channels/woocommerce/webhook/3` */
    channelWebhookBaseUrl: string,
  ): Promise<{ secret: string }>;

  /**
   * Verify signature and parse an incoming webhook payload.
   * Required when capabilities.usesWebhooks = true.
   * @param topic - value of X-WC-Webhook-Topic (or equivalent) header
   * Returns stock changes to apply in SeplorX (empty array if topic is unrecognised or no-op).
   */
  processWebhook?(
    body: string,
    signature: string,
    topic: string,
    secret: string,
  ): WebhookStockChange[];

  /**
   * Parse a webhook body into a structured order event for the stock service.
   * Used by the webhook route to upsert orders and call processOrderStockChange().
   * Optional — only needed for channels with order-status-driven webhooks.
   */
  parseWebhookOrder?(
    body: string,
    signature: string,
    secret: string,
  ): WebhookOrderEvent | null;

  /**
   * Fetch a single catalog item by its external ID (e.g. ASIN for Amazon).
   * Returns the item details as an ExternalProduct, or throws if not found.
   */
  getCatalogItem?(
    storeUrl: string,
    credentials: Record<string, string>,
    externalId: string,
    sku?: string,
    fulfillmentChannel?: string,
  ): Promise<ExternalProduct>;

  /**
   * Extract generic relationship pointers (children and missing parents) from
   * a single channel product's raw payload. Used during single-product syncs
   * to automatically pull variation families together.
   */
  extractRelationships?(rawPayload: Record<string, unknown>): {
    childIds: string[];
    parentId?: string;
  };

  /**
   * Map generic update fields submitted from the product-detail form into the
   * channel-specific rawData patch that should be persisted.
   *
   * Called by updateChannelProductService() so each channel controls how its
   * own rawData schema is mutated — without bleeding channel-specific key names
   * (e.g. "item-condition") into the shared service layer.
   *
   * @param existingRawData  The current rawData stored in the DB for this product.
   * @param patch            Only the fields that were actually submitted in the
   *                         form (undefined = field was not on the active tab).
   * @returns                A partial rawData object to be merged (shallow) into
   *                         the existing rawData, or null/undefined for no change.
   */
  mergeProductUpdate?(
    existingRawData: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Record<string, unknown> | null | undefined;

  /**
   * Push all pending_update product mappings for this channel to the remote store.
   * Required when capabilities.canPushProductUpdates = true.
   *
   * Implementations are responsible for:
   *   - Reading pending mappings from DB (via channelProductMappings)
   *   - Calling the remote API for each product
   *   - Updating syncStatus to 'in_sync' on success, 'failed' on error
   *   - Returning a summary so the caller can present results to the user
   *
   * Each product must be attempted independently — a single failure must not
   * abort the rest of the batch.
   */
  pushPendingUpdates?(
    userId: number,
    channelId: number,
  ): Promise<ChannelPushSyncResult>;

  /**
   * Fetch the distinct list of brand names available for a given channel instance.
   * Each channel type implements its own extraction logic.
   * Returns an empty array if the channel has no brand data.
   */
  getBrands?(channelId: number): Promise<string[]>;

  /**
   * Returns the Drizzle SQL expression to extract a given filter field (e.g. "brand", "category")
   * from the channel_products.raw_data JSONB column. Used by the DAL for filtering and grouping.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extractSqlField?(fieldName: "brand" | "category" | string): any | null;

  /**
   * Extract standardized fields from channel-specific rawData payload to be displayed
   * in the product details UI.
   */
   
  extractProductFields?: (
    rawData: Record<string, unknown>,
  ) => StandardizedProductRecord;

  /**
   * Fetch orders from the remote channel and persist them as sales_orders.
   * Required when a channel supports order retrieval.
   */
  fetchAndSaveOrders?(
    userId: number,
    channelId: number,
  ): Promise<{ fetched: number; saved: number }>;
}
