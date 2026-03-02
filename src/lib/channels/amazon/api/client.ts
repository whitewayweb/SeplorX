import * as zlib from "node:zlib";
import { promisify } from "node:util";
import type { ExternalProduct } from "../../types";

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
    // Hard wall-clock deadline of 55 s keeps the total under typical serverless limits.
    const DEADLINE_MS = 55_000;
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

    throw new Error("Amazon report timed out while generating (exceeded 55 s deadline).");
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
    const lines = textBase.split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split("\t").map((h) => h.trim());
    const asinIdx = headers.indexOf("asin1");
    const skuIdx = headers.indexOf("seller-sku");
    const nameIdx = headers.indexOf("item-name");
    const qtyIdx = headers.indexOf("quantity");

    const externalProducts: ExternalProduct[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split("\t");

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

    return externalProducts;
  }
}
