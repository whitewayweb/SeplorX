// Amazon SP-API handler
// The SDK (@amazon-sp-api-release/amazon-sp-api-sdk-js) uses node:fs and other
// Node built-ins. It is listed in next.config.ts → serverExternalPackages so
// Next.js/Turbopack never tries to bundle it. The dynamic import() below is
// resolved at runtime on the server only.

import type { ChannelHandler } from "../types";
import { AmazonAPIClient } from "./api/client";

import {
  configFields,
  capabilities,
  validateConfig,
  buildConnectUrl,
  extractProductFields,
} from "./config";
import { extractSqlField, getBrands } from "./queries";

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

  async getCatalogItem(storeUrl, credentials, asin, sku, fulfillmentChannel) {
    if (!credentials.marketplaceId || !credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      throw new Error("Missing required Amazon credentials (marketplaceId, clientId, clientSecret, refreshToken)");
    }

    const client = new AmazonAPIClient(credentials, storeUrl);
    return await client.getCatalogItem(asin, sku, fulfillmentChannel);
  },

  // pushStock: not implemented — capabilities.canPushStock = false
  // registerWebhooks: not applicable — capabilities.usesWebhooks = false
  // processWebhook: not applicable — capabilities.usesWebhooks = false

  mergeProductUpdate(_existingRawData, patch) {
    const updates: Record<string, unknown> = {};
    
    // Flat mapping for Amazon updates
    if (patch.price) updates["price"] = patch.price;
    if (patch.itemCondition) updates["item-condition"] = patch.itemCondition;
    if (patch.brand) updates["brand-name"] = patch.brand;
    if (patch.manufacturer) updates["manufacturer"] = patch.manufacturer;
    if (patch.partNumber) updates["part_number"] = patch.partNumber;
    if (patch.color) updates["color"] = patch.color;
    if (patch.itemTypeKw) updates["item_type_keyword"] = patch.itemTypeKw;
    if (patch.description) updates["product_description"] = patch.description;
    
    // Weights
    if (patch.pkgWeight) updates["pkg_weight"] = patch.pkgWeight;
    if (patch.itemWeight) updates["item_weight"] = patch.itemWeight;

    return Object.keys(updates).length > 0 ? updates : null;
  },

  extractSqlField,
  getBrands,
  extractProductFields,
};
