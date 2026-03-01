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

    // 1. Get Access Token using standard fetch (avoids Turbopack node built-in errors from the Amazon SDK)
    const tokenRes = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[Amazon SP-API] Token Error:", errText);
      throw new Error(`Failed to refresh Amazon token: ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

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
    }

    const allItems: CatalogItem[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(`${endpoint.replace(/\/$/, "")}/catalog/2022-04-01/items`);
      url.searchParams.append("marketplaceIds", marketplaceId);
      url.searchParams.append("includedData", "summaries,identifiers");
      url.searchParams.append("pageSize", "20");

      if (search && search.trim()) {
        url.searchParams.append("keywords", search.trim());
      }

      if (pageToken) {
        url.searchParams.append("pageToken", pageToken);
      }

      const itemsRes = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "x-amz-access-token": accessToken,
        },
      });

      if (!itemsRes.ok) {
        const errText = await itemsRes.text();
        console.error("[Amazon SP-API] Catalog Error:", errText);
        throw new Error(`Failed to fetch Amazon catalog: ${itemsRes.status}`);
      }

      const result = await itemsRes.json();
      const items = result.items || [];
      allItems.push(...items);

      pageToken = result.pagination?.nextToken;

      // Cap at 200 items to avoid excessive API calls
      if (allItems.length >= 200) break;
    } while (pageToken);

    return allItems.map((item: CatalogItem) => {
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
