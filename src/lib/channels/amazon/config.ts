import type { ChannelCapabilities, ChannelConfigField } from "../types";

export const configFields: ChannelConfigField[] = [
  {
    key: "storeUrl",
    label: "SP-API Endpoint",
    type: "url",
    required: true,
    placeholder: "e.g. https://sellingpartnerapi-eu.amazon.com",
  },
  {
    key: "marketplaceId",
    label: "Marketplace ID",
    type: "text",
    required: true,
    placeholder: "e.g. A21TJRUUN4KGV (India)",
  },
  {
    key: "clientId",
    label: "LWA Client ID",
    type: "text",
    required: true,
  },
  {
    key: "clientSecret",
    label: "LWA Client Secret",
    type: "password",
    required: true,
  },
  {
    key: "refreshToken",
    label: "LWA Refresh Token",
    type: "password",
    required: true,
  },
];

export const capabilities: ChannelCapabilities = {
  canFetchProducts: true,
  canPushStock: false,
  usesWebhooks: false,
};

export function validateConfig(config: Partial<Record<string, string>>): string | null {
  if (!config.storeUrl) return "SP-API Endpoint URL is required";
  if (!config.marketplaceId) return "Marketplace ID is required";
  if (!config.clientId) return "LWA Client ID is required";
  if (!config.clientSecret) return "LWA Client Secret is required";
  if (!config.refreshToken) return "LWA Refresh Token is required";
  try {
    new URL(config.storeUrl);
  } catch {
    return "SP-API Endpoint must be a valid URL";
  }
  return null;
}

export function buildConnectUrl(channelId: number, config: Record<string, string>, appUrl: string): string {
  void channelId;
  void config;
  const base = appUrl.replace(/\/$/, "");
  return `${base}/channels?connected=1`;
}
