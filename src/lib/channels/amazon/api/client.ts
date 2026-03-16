import * as zlib from "node:zlib";
import { promisify } from "node:util";
import type { ExternalProduct } from "../../types";

import { type SellersSchema } from "./types/sellersSchema";
import { type CatalogItemsSchema } from "./types/catalogItemsSchema";
import { type ProductTypesSchema } from "./types/productTypesSchema";
import { type ListingsItemsSchema } from "./types/listingsItemsSchema";
import { type FbaInventorySchema } from "./types/fbaInventorySchema";
import { type FeedsSchema } from "./types/feedsSchema";
import { type OrdersV0Schema } from "./types/ordersV0Schema";

const gunzipAsync = promisify(zlib.gunzip);

// ── Shared catalog fetch config ───────────────────────────────────────────────
// Central list of datasets requested on every catalog API call.
// Add or remove entries here to control what the API returns across all methods.
const CATALOG_INCLUDED_DATA =
  "summaries,images,identifiers,attributes,dimensions,relationships,productTypes" as const;

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

  public async getCatalogItem(asin: string, sku?: string, fulfillmentChannel?: string): Promise<ExternalProduct> {
    if (!asin || typeof asin !== "string") {
      throw new Error("A valid ASIN is required.");
    }

    const accessToken = await this.getAccessToken();

    const url = new URL(`${this.endpoint}/catalog/2022-04-01/items/${encodeURIComponent(asin)}`);
    url.searchParams.set("marketplaceIds", this.marketplaceId);
    url.searchParams.set("includedData", CATALOG_INCLUDED_DATA);

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

    // If we have a SKU and the product is FBA, fetch warehouse inventory
    let stockQuantity: number | undefined = undefined;
    const isFba = fulfillmentChannel && fulfillmentChannel !== "DEFAULT";
    
    if (sku && isFba && data.summaries?.[0]?.itemClassification !== "VARIATION_PARENT") {
        try {
            const fbaMap = await this.fetchFbaInventorySummaries(accessToken, [sku]);
            const fbaSummary = fbaMap.get(sku);
            if (fbaSummary?.inventoryDetails?.fulfillableQuantity !== undefined) {
              stockQuantity = fbaSummary.inventoryDetails.fulfillableQuantity;
              // Inject FBA details for UI
              (data as Record<string, unknown>).fbaInventory = fbaSummary;
            }
        } catch (e) {
            console.warn(`[Amazon SP-API] Failed to fetch FBA inventory for single item ${asin}`, e);
        }
    }

    // Derive category from the API response — marketplace-aware with fallback.
    const { category, amazonProductType } = this.extractAmazonCategory(data);

    return {
      id: data.asin ?? asin,
      name: itemName,
      sku: sku || undefined,
      type: productType,
      stockQuantity,
      rawPayload: {
        ...data,
        pricing: pricingData,
        ...(category   ? { category }          : {}),
        ...(amazonProductType ? { amazonProductType } : {}),
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

  public async createFeedDocument(contentType: string): Promise<FeedsSchema["CreateFeedDocumentResponse"]> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.endpoint}/feeds/2021-06-30/documents`);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-amz-access-token": accessToken,
      },
      body: JSON.stringify({ contentType }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] createFeedDocument Error:", errText);
      throw new Error(`Failed to create feed document: ${res.status}`);
    }

    return res.json();
  }

  public async uploadFeedData(presignedUrl: string, data: Uint8Array, contentType: string): Promise<void> {
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: contentType });
    const res = await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] uploadFeedData Error:", errText);
      throw new Error(`Failed to upload feed data: ${res.status}`);
    }
  }

  public async createFeed(feedType: string, inputFeedDocumentId: string): Promise<FeedsSchema["CreateFeedResponse"]> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.endpoint}/feeds/2021-06-30/feeds`);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-amz-access-token": accessToken,
      },
      body: JSON.stringify({
        inputFeedDocumentId,
        feedType,
        marketplaceIds: [this.marketplaceId],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] createFeed Error:", errText);
      let amazonError = "";
      try {
        const parsed = JSON.parse(errText);
        if (parsed.errors && parsed.errors.length > 0) {
          amazonError = parsed.errors[0].message;
        }
      } catch {
        // ignore
      }

      if (amazonError) {
        throw new Error(`Failed to create feed (${res.status}): ${amazonError}`);
      }
      throw new Error(`Failed to create feed: ${res.status}`);
    }

    return res.json();
  }

  public async getFeed(feedId: string): Promise<FeedsSchema["Feed"]> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.endpoint}/feeds/2021-06-30/feeds/${encodeURIComponent(feedId)}`);

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "x-amz-access-token": accessToken,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] getFeed Error:", errText);
      throw new Error(`Failed to get feed ${feedId}: ${res.status}`);
    }

    return res.json();
  }

  public async getFeedDocument(feedDocumentId: string): Promise<FeedsSchema["FeedDocument"]> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.endpoint}/feeds/2021-06-30/documents/${encodeURIComponent(feedDocumentId)}`);

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "x-amz-access-token": accessToken,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] getFeedDocument Error:", errText);
      throw new Error(`Failed to get feed document ${feedDocumentId}: ${res.status}`);
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
    const DEADLINE_MS = 40_000;
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
      fileBuffer = await gunzipAsync(fileBuffer);
    }

    const textBase = fileBuffer.toString("utf-8");
    const lines = textBase.split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase());
    const asinIdx = headers.findIndex(h => h === "asin1" || h === "asin");
    const skuIdx = headers.findIndex(h => h === "seller-sku" || h === "sku" || h === "merchant-sku");
    const nameIdx = headers.findIndex(h => h === "item-name" || h === "product-name" || h === "title");
    const qtyIdx = headers.findIndex(h => h === "quantity" || h === "qty" || h === "stock");

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

    const accessToken = await this.getAccessToken();
    await this.enrichWithCatalogData(accessToken, externalProducts);

    try {
      const fbaProducts = externalProducts.filter((p) => {
        const payload = p.rawPayload as Record<string, unknown>;
        const isFba = payload["fulfillment-channel"] && payload["fulfillment-channel"] !== "DEFAULT";
        return !!p.sku && isFba;
      });
      
      const skus = fbaProducts.map(p => p.sku as string);
      if (skus.length > 0) {
        const fbaMap = await this.fetchFbaInventorySummaries(accessToken, skus);
        for (const product of fbaProducts) {
          const summary = fbaMap.get(product.sku!);
          if (summary?.inventoryDetails?.fulfillableQuantity !== undefined) {
            product.stockQuantity = summary.inventoryDetails.fulfillableQuantity;
            if (product.rawPayload) {
              (product.rawPayload as Record<string, unknown>).fbaInventory = summary;
            }
          }
        }
      }
    } catch (err) {
      console.error("[Amazon SP-API] Failed fetch FBA inventory", { error: String(err) });
    }

    this.processProductRelationships(externalProducts);

    return externalProducts;
  }

  private async fetchFbaInventorySummaries(
    accessToken: string, 
    skus: string[]
  ): Promise<Map<string, NonNullable<NonNullable<FbaInventorySchema["GetInventorySummariesResponse"]["payload"]>["inventorySummaries"]>[number]>> {
    const results = new Map<string, NonNullable<NonNullable<FbaInventorySchema["GetInventorySummariesResponse"]["payload"]>["inventorySummaries"]>[number]>();
    const BATCH_SIZE = 50;

    for (let i = 0; i < skus.length; i += BATCH_SIZE) {
      const batch = skus.slice(i, i + BATCH_SIZE);
      const url = new URL(`${this.endpoint}/fba/inventory/v1/summaries`);
      url.searchParams.set("marketplaceIds", this.marketplaceId);
      url.searchParams.set("granularityType", "Marketplace");
      url.searchParams.set("granularityId", this.marketplaceId);
      url.searchParams.set("sellerSkus", batch.join(","));
      url.searchParams.set("details", "true");

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json", "x-amz-access-token": accessToken },
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        const data = (await res.json()) as FbaInventorySchema["GetInventorySummariesResponse"];
        const summaries = data.payload?.inventorySummaries || [];
        for (const summary of summaries) {
          if (summary.sellerSku) {
            results.set(summary.sellerSku, summary);
          }
        }
      }
      
      if (i + BATCH_SIZE < skus.length) {
        await new Promise((resolve) => setTimeout(resolve, 550));
      }
    }
    return results;
  }

  private async enrichWithCatalogData(accessToken: string, products: ExternalProduct[]): Promise<void> {
    const BATCH_SIZE = 20;
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      const asins = batch.map((p) => p.id);
      if (asins.length === 0) continue;

      const url = new URL(`${this.endpoint}/catalog/2022-04-01/items`);
      url.searchParams.set("marketplaceIds", this.marketplaceId);
      url.searchParams.set("identifiersType", "ASIN");
      url.searchParams.set("identifiers", asins.join(","));
      url.searchParams.set("includedData", CATALOG_INCLUDED_DATA);

      try {
        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json", "x-amz-access-token": accessToken },
          signal: AbortSignal.timeout(15_000),
        });

        if (res.ok) {
          const data = await res.json();
          const items = data.items || [];
          for (const item of items) {
            const product = batch.find((p) => p.id === item.asin);
            if (product) {
              const payload = product.rawPayload as Record<string, unknown>;
              if (item.summaries)   payload.summaries   = item.summaries;
              if (item.images)      payload.images      = item.images;
              if (item.identifiers) payload.identifiers = item.identifiers;
              if (item.attributes)  payload.attributes  = item.attributes;
              if (item.dimensions)  payload.dimensions  = item.dimensions;
              if (item.productTypes) payload.productTypes = item.productTypes;

              // Derive and persist Amazon category — single source of truth.
              const { category, amazonProductType } = this.extractAmazonCategory(
                item as CatalogItemsSchema["Item"],
              );
              if (category)          payload.category         = category;
              if (amazonProductType) payload.amazonProductType = amazonProductType;

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
      } catch (err) {
        console.error("[Amazon SP-API] Batch catalog enrichment failed", err);
      }

      if (i + BATCH_SIZE < products.length) {
        await new Promise((resolve) => setTimeout(resolve, 550));
      }
    }
  }

  private processProductRelationships(products: ExternalProduct[]): void {
    for (const product of products) {
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
                  const childObj = products.find((p) => p.id === childAsin);
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
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Return the entry from a marketplace-keyed array that matches the current
   * marketplace, falling back to the first element if none matches.
   * This pattern is repeated everywhere the SP-API returns per-marketplace arrays.
   */
  private forMarketplace<T extends { marketplaceId?: string }>(arr: T[] | undefined): T | undefined {
    if (!arr?.length) return undefined;
    return arr.find((entry) => entry.marketplaceId === this.marketplaceId) ?? arr[0];
  }

  /**
   * Extract the human-readable Amazon category from a catalog item response.
   *
   * Priority:
   *   1. `summaries[].browseClassification.displayName`  — rich browse-node label (e.g. "Automotive")
   *   2. `productTypes[].productType`                    — flat-file type key  (e.g. "AUTO_PART")
   *
   * Both values are returned so callers can persist whichever they need.
   */
  private extractAmazonCategory(item: CatalogItemsSchema["Item"]): {
    category?: string;
    amazonProductType?: string;
  } {
    const summary = this.forMarketplace(item.summaries);
    const browseCategory = summary?.browseClassification?.displayName;

    const productTypeEntry = this.forMarketplace(item.productTypes);
    const amazonProductType = productTypeEntry?.productType;

    return {
      category: browseCategory ?? amazonProductType,
      amazonProductType,
    };
  }

  /**
   * Fetch a list of orders.
   * API: /orders/v0/orders (getOrders)
   */
  public async getOrders(createdAfter?: string): Promise<OrdersV0Schema["GetOrdersResponse"]["payload"]> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.endpoint}/orders/v0/orders`);
    url.searchParams.set("MarketplaceIds", this.marketplaceId);
    if (createdAfter) url.searchParams.set("CreatedAfter", createdAfter);

    let allOrders: NonNullable<OrdersV0Schema["GetOrdersResponse"]["payload"]>["Orders"] = [];
    let nextToken: string | undefined = undefined;

    do {
      const currentUrl = new URL(url.toString());
      if (nextToken) {
        currentUrl.searchParams.set("NextToken", nextToken);
      }

      const res = await fetch(currentUrl.toString(), {
        headers: {
          Accept: "application/json",
          "x-amz-access-token": accessToken,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("[Amazon SP-API] getOrders Error:", errText);
        throw new Error(`Failed to get orders: ${res.status}`);
      }

      const data = (await res.json()) as OrdersV0Schema["GetOrdersResponse"];
      if (data.payload?.Orders) {
        allOrders = allOrders.concat(data.payload.Orders);
      }
      
      nextToken = data.payload?.NextToken;
    } while (nextToken);

    return { Orders: allOrders };
  }

  /**
   * Fetch line items for a specific order.
   * API: /orders/v0/orders/{orderId}/orderItems (getOrderItems)
   */
  public async getOrderItems(orderId: string): Promise<OrdersV0Schema["GetOrderItemsResponse"]["payload"]> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.endpoint}/orders/v0/orders/${encodeURIComponent(orderId)}/orderItems`);

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "x-amz-access-token": accessToken,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] getOrderItems Error:", errText);
      throw new Error(`Failed to get order items for ${orderId}: ${res.status}`);
    }

    const data = (await res.json()) as OrdersV0Schema["GetOrderItemsResponse"];
    return data.payload;
  }

  /**
   * Fetch buyer info for a specific order.
   * API: /orders/v0/orders/{orderId}/buyerInfo (getOrderBuyerInfo)
   */
  public async getOrderBuyerInfo(orderId: string): Promise<OrdersV0Schema["GetOrderBuyerInfoResponse"]["payload"]> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.endpoint}/orders/v0/orders/${encodeURIComponent(orderId)}/buyerInfo`);

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "x-amz-access-token": accessToken,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] getOrderBuyerInfo Error:", errText);
      throw new Error(`Failed to get buyer info for ${orderId}: ${res.status}`);
    }

    const data = (await res.json()) as OrdersV0Schema["GetOrderBuyerInfoResponse"];
    return data.payload;
  }

  /**
   * Fetch shipping address for a specific order.
   * API: /orders/v0/orders/{orderId}/address (getOrderAddress)
   */
  public async getOrderAddress(orderId: string): Promise<OrdersV0Schema["GetOrderAddressResponse"]["payload"]> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.endpoint}/orders/v0/orders/${encodeURIComponent(orderId)}/address`);

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "x-amz-access-token": accessToken,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Amazon SP-API] getOrderAddress Error:", errText);
      throw new Error(`Failed to get address for ${orderId}: ${res.status}`);
    }

    const data = (await res.json()) as OrdersV0Schema["GetOrderAddressResponse"];
    return data.payload;
  }
}
