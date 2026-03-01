export type ChannelType = "woocommerce" | "shopify" | "amazon" | "custom";

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
  buildConnectUrl?: (channelId: number, config: Record<string, string>, appUrl: string) => string;
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
}

// ─── Channel Handler (per-channel-type plugin interface) ─────────────────────

export interface ChannelConfigField {
  key: string;
  label: string;
  type: "url" | "text" | "password" | "select";
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
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

export interface ExternalProduct {
  id: string;
  name: string;
  sku?: string;
  stockQuantity?: number;
  /** Product type returned by the channel (e.g. "simple", "variable", "variation") */
  type?: "simple" | "variable" | "variation";
  /** For variations: the parent variable product ID */
  parentId?: string;
}

export interface ChannelCapabilities {
  /** Can fetch a product list from the remote channel (used in Add Products drawer) */
  canFetchProducts: boolean;
  /** Can push stock quantity back to the remote channel */
  canPushStock: boolean;
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
}

