// Amazon SP-API handler
// The SDK (@amazon-sp-api-release/amazon-sp-api-sdk-js) uses node:fs and other
// Node built-ins. It is listed in next.config.ts → serverExternalPackages so
// Next.js/Turbopack never tries to bundle it. The dynamic import() below is
// resolved at runtime on the server only.

import type { ChannelHandler } from "../types";



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
    const marketplaceId = credentials.marketplaceId;
    const clientId = credentials.clientId;
    const clientSecret = credentials.clientSecret;
    const refreshToken = credentials.refreshToken;
    const endpoint = credentials.storeUrl || storeUrl;

    if (!marketplaceId || !clientId || !clientSecret || !refreshToken) {
      throw new Error("Missing required Amazon credentials (marketplaceId, clientId, clientSecret, refreshToken)");
    }

    // Dynamic import — safe because the SDK is in serverExternalPackages in next.config.ts
    // and this function is only ever called from a Next.js Server Action.
    const sdk = await import("@amazon-sp-api-release/amazon-sp-api-sdk-js");
    const { ApiClient, CatalogApi } = sdk.CatalogitemsSpApi;

    const apiClient = new ApiClient(endpoint);
    apiClient.enableAutoRetrievalAccessToken(clientId, clientSecret, refreshToken, null);

    const catalogApi = new CatalogApi(apiClient);

    interface CatalogItem {
      asin?: string;
      summaries?: Array<{
        marketplaceId?: string;
        itemName?: string;
        brandName?: string;
      }>;
      identifiers?: Array<{
        marketplaceId?: string;
        identifiers?: Array<{
          identifierType?: string;
          identifier?: string;
        }>;
      }>;
      salesRanks?: unknown;
    }

    interface ItemSearchResults {
      items?: CatalogItem[];
      pagination?: { nextToken?: string };
    }

    const allItems: CatalogItem[] = [];
    let pageToken: string | undefined;

    // Paginate through all results (max 20 per page for SP-API Catalog)
    do {
      const opts: Record<string, unknown> = {
        includedData: ["summaries", "identifiers"],
        pageSize: 20,
      };

      if (search && search.trim()) {
        opts.keywords = [search.trim()];
      }

      if (pageToken) {
        opts.pageToken = pageToken;
      }

      const result = await catalogApi.searchCatalogItems([marketplaceId], opts) as ItemSearchResults;
      const items = result?.items ?? [];
      allItems.push(...items);

      pageToken = result?.pagination?.nextToken;

      // Cap at 200 items to avoid excessive API calls
      if (allItems.length >= 200) break;
    } while (pageToken);

    return allItems.map((item) => {
      const asin = item.asin ?? "";
      const summary = item.summaries?.find((s) => s.marketplaceId === marketplaceId) ?? item.summaries?.[0];
      const identifierGroup = item.identifiers?.find((g) => g.marketplaceId === marketplaceId) ?? item.identifiers?.[0];
      const skuIdentifier = identifierGroup?.identifiers?.find((id) => id.identifierType === "SKU");

      return {
        id: asin,
        name: summary?.itemName ?? asin,
        sku: skuIdentifier?.identifier,
        type: "simple" as const,
      };
    });
  },

  // pushStock: not implemented — capabilities.canPushStock = false
  // registerWebhooks: not applicable — capabilities.usesWebhooks = false
  // processWebhook: not applicable — capabilities.usesWebhooks = false
};
