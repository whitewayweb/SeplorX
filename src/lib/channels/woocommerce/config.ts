import type { ChannelCapabilities, ChannelConfigField } from "../types";

export const configFields: ChannelConfigField[] = [
  {
    key: "storeUrl",
    label: "Store URL",
    type: "url",
    required: true,
    placeholder: "https://yourstore.com",
  },
];

export const capabilities: ChannelCapabilities = {
  canFetchProducts: true,
  canPushStock: true,
  usesWebhooks: true,
};

export function validateConfig(config: Partial<Record<string, string>>): string | null {
  if (!config.storeUrl) return "Store URL is required for WooCommerce";
  try {
    const url = new URL(config.storeUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Store URL must start with http:// or https://";
    }
  } catch {
    return "Store URL must be a valid URL";
  }
  return null;
}

export function buildConnectUrl(channelId: number, config: Record<string, string>, appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  const storeBase = new URL(config.storeUrl!).origin;
  const params = new URLSearchParams({
    app_name: "SeplorX",
    scope: "read_write",
    user_id: String(channelId),
    return_url: `${base}/channels?connected=woocommerce`,
    callback_url: `${base}/api/channels/woocommerce/callback`,
  });
  return `${storeBase}/wc-auth/v1/authorize?${params}`;
}
