import type { ChannelCapabilities, ChannelConfigField } from "../types";

export const configFields: ChannelConfigField[] = [
  {
    key: "storeUrl",
    label: "SP-API Endpoint Region",
    type: "select",
    required: true,
    halfWidth: true,
    options: [
      { label: "India / Europe (EU)", value: "https://sellingpartnerapi-eu.amazon.com" },
      { label: "North America (US, CA, MX)", value: "https://sellingpartnerapi-na.amazon.com" },
      { label: "Far East (JP, SG, AU)", value: "https://sellingpartnerapi-fe.amazon.com" },
    ],
  },
  {
    key: "marketplaceId",
    label: "Marketplace",
    type: "select",
    required: true,
    halfWidth: true,
    options: [
      { label: "India (IN)", value: "A21TJRUUN4KGV" },
      { label: "United States (US)", value: "ATVPDKIKX0DER" },
      { label: "Canada (CA)", value: "A2EUQ1WTGCTBG2" },
      { label: "United Kingdom (UK)", value: "A1F83G8C2ARO7P" },
      { label: "Australia (AU)", value: "A39IBJ37TRP1C6" },
      { label: "United Arab Emirates (AE)", value: "A2VIGQ35RCS4UG" },
    ],
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
  return `${base}/channels?connected=amazon`;
}
