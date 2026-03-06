// Amazon SP-API handler
// The SDK (@amazon-sp-api-release/amazon-sp-api-sdk-js) uses node:fs and other
// Node built-ins. It is listed in next.config.ts → serverExternalPackages so
// Next.js/Turbopack never tries to bundle it. The dynamic import() below is
// resolved at runtime on the server only.
// resolved at runtime on the server only.

import type { ChannelHandler } from "../types";
import { AmazonAPIClient } from "./api/client";

import {
  configFields,
  capabilities,
  validateConfig,
  buildConnectUrl,
} from "./config";

export const amazonHandler: ChannelHandler = {
  id: "amazon",
  configFields,
  capabilities,
  webhookTopics: [],

  validateConfig,
  buildConnectUrl,

  parseCallback() {
    // Not used for API key auth type.
    return null;
  },

  async fetchProducts(storeUrl, credentials, search) {
    if (!credentials.marketplaceId || !credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      throw new Error("Missing required Amazon credentials (marketplaceId, clientId, clientSecret, refreshToken)");
    }

    const client = new AmazonAPIClient(credentials, storeUrl);
    return await client.fetchProducts(search);
  },

  async getCatalogItem(storeUrl, credentials, asin) {
    if (!credentials.marketplaceId || !credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      throw new Error("Missing required Amazon credentials (marketplaceId, clientId, clientSecret, refreshToken)");
    }

    const client = new AmazonAPIClient(credentials, storeUrl);
    return await client.getCatalogItem(asin);
  },

  // pushStock: not implemented — capabilities.canPushStock = false
  // registerWebhooks: not applicable — capabilities.usesWebhooks = false
  // processWebhook: not applicable — capabilities.usesWebhooks = false
};
