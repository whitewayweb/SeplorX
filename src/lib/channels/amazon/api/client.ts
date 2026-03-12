import * as zlib from "node:zlib";
import { promisify } from "node:util";
import type { ExternalProduct } from "../../types";

import { type SellersSchema } from "./types/sellersSchema";
import { type CatalogItemsSchema } from "./types/catalogItemsSchema";
import { type ProductTypesSchema } from "./types/productTypesSchema";
import { type ListingsItemsSchema } from "./types/listingsItemsSchema";

const gunzipAsync = promisify(zlib.gunzip);

export class AmazonAPIClient {
  private marketplaceId: string;
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private endpoint: string;

  constructor(credentials: Record<string, string>, storeUrl: string) {
    this.marketplaceId = credentials.marketplaceId;
    this.clientId = credentials.clientId;
    this.clientSecret = credentials.clientSecret;
    this.refreshToken = credentials.refreshToken;
    this.endpoint = (credentials.storeUrl || storeUrl).replace(/\/$/, "");
  }

  private async getAccessToken(): Promise<string> {
    const tokenRes = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[Amazon SP-API] Token Error:", errText);
      throw new Error(`Failed to refresh Amazon token: ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json();
    return tokenData.access_token;
  }

  public async fetchProducts(search?: string): Promise<ExternalProduct[]> {
    const accessToken = await this.getAccessToken();

    const reportId = await this.createListingReport(accessToken);
    const reportDocumentId = await this.pollReportStatus(accessToken, reportId);
    const { url, compressionAlgorithm } = await this.getReportDocumentUrl(accessToken, reportDocumentId);

    return await this.downloadAndParseReport(url, compressionAlgorithm, search);
  }

  public async getCatalogItem(asin: string): Promise<ExternalProduct> {
    if (!asin || typeof asin !== "string") {
      throw new Error("A valid ASIN is required.");
    }

    const accessToken = await this.getAccessToken();

    const url = new URL(`${this.endpoint}/catalog/2022-04-01/items/${encodeURIComponent(asin)}`);
    url.searchParams.set("marketplaceIds", this.marketplaceId);
    url.searchParams.set("includedData", "summaries,images,identifiers,attributes,dimensions,relationships");

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "x-amz-access-token": accessToken,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] getCatalogItem Error:", errText);
      throw new Error(`Failed to get catalog item for ASIN ${asin}: ${res.status}`);
    }

    const data = (await res.json()) as CatalogItemsSchema["Item"];

    let pricingData = null;
    try {
      pricingData = await this.getProductPricing(accessToken, asin);
    } catch (err) {
      console.warn(`[Amazon SP-API] Failed to fetch pricing for ASIN ${asin}`, err);
    }

    // Extract item name from the summaries array
    const summaries = data.summaries ?? [];
    const itemName =
      summaries.find((s) => s.marketplaceId === this.marketplaceId)?.itemName ??
      summaries[0]?.itemName ??
      asin;

    // Determine product type:
    //   VARIATION_PARENT → "variable" (has children)
    //   default          → undefined (simple / unknown)
    const itemClassification =
      summaries.find((s) => s.marketplaceId === this.marketplaceId)?.itemClassification ??
      summaries[0]?.itemClassification;

    let productType: "variable" | "variation" | "simple" | undefined = itemClassification === "VARIATION_PARENT" ? "variable" : undefined;

    if (!productType && Array.isArray(data.relationships)) {
      for (const byMarketplace of data.relationships) {
        if (!Array.isArray(byMarketplace.relationships)) continue;
        for (const rel of byMarketplace.relationships) {
          if (rel.type === "VARIATION" && Array.isArray(rel.childAsins)) {
            productType = "variable";
            break;
          }
        }
      }
    }

    return {
      id: data.asin ?? asin,
      name: itemName,
      type: productType,
      rawPayload: {
        ...data,
        pricing: pricingData,
      },
    };
  }

  public async getProductPricing(accessToken: string, asin: string): Promise<unknown> {
    if (!asin || typeof asin !== "string") {
      throw new Error("A valid ASIN is required.");
    }

    const url = new URL(`${this.endpoint}/products/pricing/v0/price`);

    url.searchParams.set("MarketplaceId", this.marketplaceId);
    url.searchParams.set("ItemType", "Asin");
    url.searchParams.set("Asins", asin);

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "x-amz-access-token": accessToken,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] getProductPricing Error:", errText);
      throw new Error(`Failed to get pricing for ASIN ${asin}: ${res.status}`);
    }

    return res.json();
  }

  /**
   * Sellers API — list all marketplaces the seller participates in.
   * Useful for validating credentials and auto-discovering marketplace IDs.
   * GET /sellers/v1/marketplaceParticipations
   */
  public async getMarketplaceParticipations(): Promise<SellersSchema["GetMarketplaceParticipationsResponse"]> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.endpoint}/sellers/v1/marketplaceParticipations`);
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "x-amz-access-token": accessToken },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] getMarketplaceParticipations Error:", errText);
      throw new Error(`Failed to get marketplace participations: ${res.status}`);
    }
    return res.json();
  }

  /**
   * Listings Items API — fetch a single listing by seller SKU.
   * Complements getCatalogItem (by ASIN) with SKU-based lookup.
   * GET /listings/2021-08-01/items/:sellerId/:sku
   */
  public async getListingItem(sellerId: string, sku: string, includedData = "summaries"): Promise<ListingsItemsSchema["Item"]> {
    if (!sellerId || !sku) throw new Error("sellerId and sku are required.");
    const accessToken = await this.getAccessToken();
    const url = new URL(
      `${this.endpoint}/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`
    );
    url.searchParams.set("marketplaceIds", this.marketplaceId);
    url.searchParams.set("includedData", includedData);
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "Content-Type": "application/json", "x-amz-access-token": accessToken },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] getListingItem Error:", errText);
      throw new Error(`Failed to get listing item for SKU ${sku}: ${res.status}`);
    }
    return res.json();
  }

  /**
   * Product Type Definitions API — search for Amazon product types.
   * Returns schemas that define required/optional attributes per product type.
   * Use keywords (e.g. "car parts") or leave empty to list all.
   * GET /definitions/2020-09-01/productTypes
   */
  public async searchProductTypes(keywords?: string): Promise<ProductTypesSchema["ProductTypeList"]> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.endpoint}/definitions/2020-09-01/productTypes`);
    url.searchParams.set("marketplaceIds", this.marketplaceId);
    if (keywords) url.searchParams.set("keywords", keywords);
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "x-amz-access-token": accessToken },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] searchProductTypes Error:", errText);
      throw new Error(`Failed to search product types: ${res.status}`);
    }
    return res.json();
  }

  private async createListingReport(accessToken: string): Promise<string> {
    const createReportUrl = new URL(`${this.endpoint}/reports/2021-06-30/reports`);
    const createReportRes = await fetch(createReportUrl.toString(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-amz-access-token": accessToken,
      },
      body: JSON.stringify({
        reportType: "GET_MERCHANT_LISTINGS_ALL_DATA",
        marketplaceIds: [this.marketplaceId],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!createReportRes.ok) {
      const errText = await createReportRes.text();
      console.error("[Amazon SP-API] Create Report Error:", errText);
      throw new Error(`Failed to request Amazon report: ${createReportRes.status}`);
    }

    const { reportId } = await createReportRes.json();
    return reportId;
  }

  private async pollReportStatus(accessToken: string, reportId: string): Promise<string> {
    // Use exponential backoff (3 s → 6 s → 12 s … capped at 15 s per interval).
    const DEADLINE_MS = 40_000; // 40 seconds to prevent serverless function timeout
    const deadline = Date.now() + DEADLINE_MS;
    let intervalMs = 3_000;

    while (Date.now() < deadline) {
      await new Promise((res) => setTimeout(res, intervalMs));
      intervalMs = Math.min(intervalMs * 2, 15_000);

      if (Date.now() >= deadline) break;

      const getReportUrl = new URL(`${this.endpoint}/reports/2021-06-30/reports/${reportId}`);
      const getReportRes = await fetch(getReportUrl.toString(), {
        headers: {
          Accept: "application/json",
          "x-amz-access-token": accessToken,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!getReportRes.ok) continue;
      const reportStatus = await getReportRes.json();

      if (reportStatus.processingStatus === "DONE") {
        return reportStatus.reportDocumentId;
      } else if (
        reportStatus.processingStatus === "CANCELLED" ||
        reportStatus.processingStatus === "FATAL"
      ) {
        throw new Error(`Amazon report failed: ${reportStatus.processingStatus}`);
      }
    }

    throw new Error(`Amazon report timed out while generating (exceeded ${Math.round(DEADLINE_MS / 1000)}s deadline).`);
  }

  private async getReportDocumentUrl(accessToken: string, reportDocumentId: string): Promise<{ url: string; compressionAlgorithm?: string }> {
    const getDocUrl = new URL(`${this.endpoint}/reports/2021-06-30/documents/${reportDocumentId}`);
    const getDocRes = await fetch(getDocUrl.toString(), {
      headers: {
        Accept: "application/json",
        "x-amz-access-token": accessToken,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!getDocRes.ok) {
      const errText = await getDocRes.text();
      console.error("[Amazon SP-API] Get Document Error:", errText);
      throw new Error(`Failed to get Amazon report document info: ${getDocRes.status}`);
    }

    const docDetails = await getDocRes.json();
    return {
      url: docDetails.url,
      compressionAlgorithm: docDetails.compressionAlgorithm,
    };
  }

  private async downloadAndParseReport(downloadUrl: string, compressionAlgorithm?: string, search?: string): Promise<ExternalProduct[]> {
    const downloadRes = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!downloadRes.ok) {
      throw new Error(`Failed to download report file: ${downloadRes.status}`);
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    let fileBuffer = Buffer.from(arrayBuffer);

    if (compressionAlgorithm === "GZIP") {
      // Use async gunzip — gunzipSync blocks the event loop on large payloads.
      fileBuffer = await gunzipAsync(fileBuffer);
    }

    const textBase = fileBuffer.toString("utf-8");
    const lines = textBase.split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split("\t").map((h) => h.trim());
    const asinIdx = headers.indexOf("asin1");
    const skuIdx = headers.indexOf("seller-sku");
    const nameIdx = headers.indexOf("item-name");
    const qtyIdx = headers.indexOf("quantity");

    const externalProducts: ExternalProduct[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split("\t").map(c => c.trim());

      const asin = asinIdx >= 0 ? cols[asinIdx] : "";
      const sku = skuIdx >= 0 ? cols[skuIdx] : "";
      const name = nameIdx >= 0 ? cols[nameIdx] : asin;
      const qtyStr = qtyIdx >= 0 ? cols[qtyIdx] : "";
      const stockQuantity = parseInt(qtyStr, 10);

      if (!asin) continue;

      const rawPayload: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        if (cols[j] !== undefined && cols[j] !== null) {
          rawPayload[headers[j]] = cols[j];
        }
      }

      if (search) {
        const query = search.toLowerCase();
        if (
          !name.toLowerCase().includes(query) &&
          !sku.toLowerCase().includes(query) &&
          !asin.toLowerCase().includes(query)
        ) {
          continue;
        }
      }

      externalProducts.push({
        id: asin,
        name,
        sku: sku || undefined,
        stockQuantity: isNaN(stockQuantity) ? undefined : stockQuantity,
        rawPayload,
      });
    }

    // Now, batch fetch the actual catalog brand names via the Catalog Items API.
    // Amazon allows up to 20 internal identifiers (ASIN/SKU) per request.
    // The rate limit for search is 2 requests per second.
    try {
      const accessToken = await this.getAccessToken();
      const BATCH_SIZE = 20;

      for (let i = 0; i < externalProducts.length; i += BATCH_SIZE) {
        const batch = externalProducts.slice(i, i + BATCH_SIZE);
        const asins = batch.map((p) => p.id);
        if (asins.length === 0) continue;

        const url = new URL(`${this.endpoint}/catalog/2022-04-01/items`);
        url.searchParams.set("marketplaceIds", this.marketplaceId);
        url.searchParams.set("identifiersType", "ASIN");
        url.searchParams.set("identifiers", asins.join(","));
        url.searchParams.set("includedData", "summaries,images,identifiers,attributes,dimensions,relationships");

        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json", "x-amz-access-token": accessToken },
          signal: AbortSignal.timeout(15_000),
        });

        if (res.ok) {
          const data = await res.json();
          // Map catalog items back onto the products by ASIN
          const items = data.items || [];
          for (const item of items) {
            const product = batch.find((p) => p.id === item.asin);
            if (product) {
              const payload = product.rawPayload as Record<string, unknown>;
              if (item.summaries) payload.summaries = item.summaries;
              if (item.images) payload.images = item.images;
              if (item.identifiers) payload.identifiers = item.identifiers;
              if (item.attributes) payload.attributes = item.attributes;
              if (item.dimensions) payload.dimensions = item.dimensions;

              // Amazon's batch searchCatalogItems truncates relationships.
              // If we see it's a parent / has relationships, fetch the full item using getCatalogItem.
              let fullRelationships = item.relationships;

              const hasChildren = item.relationships?.some((r: { relationships?: Array<{ childAsins?: string[] }> }) =>
                r.relationships?.some((rel) => rel.childAsins && rel.childAsins.length > 0)
              );

              if (hasChildren) {
                try {
                  const fullItemUrl = new URL(`${this.endpoint}/catalog/2022-04-01/items/${encodeURIComponent(item.asin)}`);
                  fullItemUrl.searchParams.set("marketplaceIds", this.marketplaceId);
                  fullItemUrl.searchParams.set("includedData", "relationships");

                  const singleRes = await fetch(fullItemUrl.toString(), {
                    headers: { Accept: "application/json", "x-amz-access-token": accessToken },
                    signal: AbortSignal.timeout(15_000),
                  });
                  if (singleRes.ok) {
                    const singleData = await singleRes.json();
                    if (singleData.relationships) {
                      fullRelationships = singleData.relationships;
                    }
                  }
                  // Respect rate limits for individual item fetch (2 req/s)
                  await new Promise((r) => setTimeout(r, 550));
                } catch (e) {
                  console.warn(`[Amazon SP-API] Failed to fetch full relationships for parent ASIN ${item.asin}`, e);
                }
              }

              if (fullRelationships) {
                payload.relationships = fullRelationships;
              }
            }
          }
        }

        // Wait 500ms to respect the 2 requests per second rate limit for batch search
        await new Promise((resolve) => setTimeout(resolve, 550));
      }

      // ── Process relationships to identify parents and children ──
      // This is necessary so the data structure matches SeplorX's DB schema correctly on first sync.
      for (const product of externalProducts) {
        const payload = product.rawPayload as Record<string, unknown>;

        const summaries = payload.summaries as Array<{ marketplaceId?: string; itemClassification?: string }> | undefined;
        const itemClassification =
          summaries?.find((s) => s.marketplaceId === this.marketplaceId)?.itemClassification ??
          summaries?.[0]?.itemClassification;

        if (itemClassification === "VARIATION_PARENT") {
          product.type = "variable";
        }

        if (Array.isArray(payload.relationships)) {
          for (const byMarketplace of payload.relationships) {
            if (!Array.isArray(byMarketplace.relationships)) continue;
            for (const rel of byMarketplace.relationships) {
              if (rel.type === "VARIATION" && Array.isArray(rel.childAsins)) {
                product.type = "variable";
                for (const childAsin of rel.childAsins) {
                  if (childAsin && childAsin !== product.id) {
                    const childObj = externalProducts.find((p) => p.id === childAsin);
                    if (childObj) {
                      childObj.type = "variation";
                      childObj.parentId = product.id;
                      if (childObj.rawPayload) {
                        childObj.rawPayload.parentId = product.id;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

    } catch (err) {
      console.error("[Amazon SP-API] Failed batch fetching catalog brands", { action: "batchFetchCatalogBrands", error: String(err) });
      // Suppress full failure, rely on existing report data if catalog fails partially.
    }

    return externalProducts;
  }
}
