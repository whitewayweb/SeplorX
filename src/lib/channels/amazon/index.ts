import type { ChannelHandler, ChannelConfigField } from "../types";

const configFields: ChannelConfigField[] = [
  {
    key: "storeUrl",
    label: "SP-API Endpoint URL",
    type: "url",
    required: true,
    placeholder: "e.g. https://sellingpartnerapi-na.amazon.com",
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

export const amazonHandler: ChannelHandler = {
  id: "amazon",
  configFields,
  webhookTopics: [],

  validateConfig(config) {
    if (!config.storeUrl) return "Endpoint URL is required";
    if (!config.clientId) return "Client ID is required";
    if (!config.clientSecret) return "Client Secret is required";
    if (!config.refreshToken) return "Refresh Token is required";
    try {
      new URL(config.storeUrl);
    } catch {
      return "Endpoint must be a valid URL";
    }
    return null;
  },

  buildConnectUrl(channelId, config, appUrl) {
    // For apikey auth type, the credentials are encrypted and stored in createChannel directly.
    // We just return the user to the channels list.
    const base = appUrl.replace(/\/$/, "");
    return `${base}/channels?connected=1`;
  },

  parseCallback() {
    // Not used for apikey auth type.
    return null;
  },

  async fetchProducts(storeUrl: string, credentials: Record<string, string>) {
    try {
      // Basic implementation to ensure the SDK works as per docs.
      // Bypass Webpack static analysis so this works in Next.js builds since the SDK requires `node:fs`
      const requireFunc = typeof window !== "undefined" ? null : eval("require");
      if (!requireFunc) return [];
      
      const { SellersSpApi } = requireFunc("@amazon-sp-api-release/amazon-sp-api-sdk-js");
      
      const endpoint = credentials.storeUrl || storeUrl;
      const sellersApiClient = new SellersSpApi.ApiClient(endpoint);
      sellersApiClient.enableAutoRetrievalAccessToken(
        credentials.clientId,
        credentials.clientSecret,
        credentials.refreshToken,
        null
      );
      
      const sellersApi = new SellersSpApi.SellersApi(sellersApiClient);
      const participations = await sellersApi.getMarketplaceParticipations();
      
      console.log("Amazon SP-API participations:", participations);
    } catch (error) {
      console.error("Exception when calling getMarketplaceParticipations API", error instanceof Error ? error.message : error);
    }
    
    // For now, return an empty array until product fetching is fully mapped.
    return [];
  },

  async pushStock(storeUrl: string, credentials: Record<string, string>, externalProductId: string, quantity: number) {
    // Implementation for stock update (e.g. Feeds API or Listings Items API)
    console.log("Amazon pushStock called", { storeUrl, credentials, externalProductId, quantity });
  },

  async registerWebhooks() {
    // Amazon SP-API uses SQS for notifications, not standard webhooks.
    console.warn("Register webhooks is not typically applicable for Amazon SP-API like this.");
    return { secret: "sqs_or_eventbridge" };
  },

  processWebhook() {
    return [];
  },
};
