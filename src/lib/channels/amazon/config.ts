import type { ChannelCapabilities, ChannelConfigField, StandardizedProductRecord } from "../types";

// Helper for Amazon raw data extraction
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNestedValue(obj: any, key: string): string {
    if (!obj) return "";
    if (typeof obj[key] === "string") return obj[key];
    if (Array.isArray(obj[key]) && obj[key][0]?.value) return obj[key][0].value;
    return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDimensionValue(dimObj: any, key: string): string {
    if (!dimObj?.[key]) return "";
    const val  = dimObj[key].value !== undefined ? dimObj[key].value : dimObj[key];
    const unit = dimObj[key].unit || "";
    const num  = Number(val);
    if (isNaN(num)) return "";
    return `${num.toFixed(2)} ${unit}`.trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Registry & Constants
// ────────────────────────────────────────────────────────────────────────────

interface AmazonMarketplace {
  id: string;
  label: string;
  domain: string;
  region: "na" | "eu" | "fe";
}

/**
 * Single source of truth for Amazon Marketplaces.
 * Reference: https://developer-docs.amazon.com/sp-api/docs/marketplace-ids
 */
export const AMAZON_MARKETPLACES: AmazonMarketplace[] = [
  // North America (NA)
  { id: "ATVPDKIKX0DER", label: "United States (US)", domain: "amazon.com", region: "na" },
  { id: "A2EUQ1WTGCTBG2", label: "Canada (CA)", domain: "amazon.ca", region: "na" },
  { id: "A1AM78C64UM0Y8", label: "Mexico (MX)", domain: "amazon.com.mx", region: "na" },
  { id: "A2Q3Y263D00KWC", label: "Brazil (BR)", domain: "amazon.com.br", region: "na" },

  // Europe (EU) & India
  { id: "A1F83G8C2ARO7P", label: "United Kingdom (UK)", domain: "amazon.co.uk", region: "eu" },
  { id: "A1PA67BAS5O4GM", label: "Germany (DE)", domain: "amazon.de", region: "eu" },
  { id: "A13V1IB3VIYZZH", label: "France (FR)", domain: "amazon.fr", region: "eu" },
  { id: "APJ6JRA9NG5V4", label: "Italy (IT)", domain: "amazon.it", region: "eu" },
  { id: "A1RKKUPIHCS9HS", label: "Spain (ES)", domain: "amazon.es", region: "eu" },
  { id: "A1805IZSGTT6HS", label: "Netherlands (NL)", domain: "amazon.nl", region: "eu" },
  { id: "A2NODRK31TC262", label: "Sweden (SE)", domain: "amazon.se", region: "eu" },
  { id: "A1C37XADRE6JJA", label: "Poland (PL)", domain: "amazon.pl", region: "eu" },
  { id: "AMEN7PMS3EDWL", label: "Belgium (BE)", domain: "amazon.com.be", region: "eu" },
  { id: "A33AVAJ2PDY3EV", label: "Turkey (TR)", domain: "amazon.com.tr", region: "eu" },
  { id: "A21TJRUUN4KGV", label: "India (IN)", domain: "amazon.in", region: "eu" },
  { id: "A2VIGQ35RCS4UG", label: "United Arab Emirates (AE)", domain: "amazon.ae", region: "eu" },
  { id: "A17E79C6D8DWNP", label: "Saudi Arabia (SA)", domain: "amazon.sa", region: "eu" },
  { id: "ARBP9OOSHTCHU", label: "Egypt (EG)", domain: "amazon.eg", region: "eu" },

  // Far East (FE)
  { id: "A1VC38T7YXB528", label: "Japan (JP)", domain: "amazon.co.jp", region: "fe" },
  { id: "A19S7P0AHS94K", label: "Singapore (SG)", domain: "amazon.sg", region: "fe" },
  { id: "A39IBJ37TRP1C6", label: "Australia (AU)", domain: "amazon.com.au", region: "fe" },
];

/** Mapping of SeplorX generic regions to SP-API Production Endpoints */
export const SP_API_ENDPOINTS: Record<string, string> = {
  na: "https://sellingpartnerapi-na.amazon.com",
  eu: "https://sellingpartnerapi-eu.amazon.com",
  fe: "https://sellingpartnerapi-fe.amazon.com",
};

// Faster lookups for runtime
const MARKETPLACE_MAP = Object.fromEntries(AMAZON_MARKETPLACES.map(m => [m.id, m]));

// ────────────────────────────────────────────────────────────────────────────
// Core Handlers
// ────────────────────────────────────────────────────────────────────────────

/** Generates a public product link based on ASIN and Marketplace ID */
export function getProductUrl(asin: string, credentials?: Record<string, string>): string | null {
  const marketplaceId = credentials?.marketplaceId;
  const domain = (marketplaceId && MARKETPLACE_MAP[marketplaceId]?.domain) || "amazon.com";
  return `https://www.${domain}/dp/${asin}`;
}

/** Pre-connection Wizard Fields */
export const configFields: ChannelConfigField[] = [
  {
    key: "storeUrl",
    label: "SP-API Endpoint Region",
    type: "select",
    required: true,
    halfWidth: true,
    options: [
      { label: "India / Europe (EU)", value: SP_API_ENDPOINTS.eu },
      { label: "North America (US, CA, MX, BR)", value: SP_API_ENDPOINTS.na },
      { label: "Far East (JP, SG, AU)", value: SP_API_ENDPOINTS.fe },
    ],
  },
  {
    key: "marketplaceId",
    label: "Marketplace",
    type: "select",
    required: true,
    halfWidth: true,
    options: AMAZON_MARKETPLACES.map(m => ({
      label: m.label,
      value: m.id,
    })).sort((a, b) => a.label.localeCompare(b.label)),
  },
  { key: "clientId", label: "LWA Client ID", type: "text", required: true },
  { key: "clientSecret", label: "LWA Client Secret", type: "password", required: true },
  { key: "refreshToken", label: "LWA Refresh Token", type: "password", required: true },
];

export const capabilities: ChannelCapabilities = {
  canFetchProducts: true,
  canPushStock: false,
  canPushProductUpdates: false, // Amazon uses the Feeds API (xlsm templates), not direct REST push
  usesWebhooks: false,
};

// ────────────────────────────────────────────────────────────────────────────
// Validation Logic
// ────────────────────────────────────────────────────────────────────────────

/** Cross-field validation for Amazon SP-API */
export function validateConfig(config: Partial<Record<string, string>>): string | null {
  const { storeUrl, marketplaceId, clientId, clientSecret, refreshToken } = config;

  // Basic Presence
  if (!storeUrl) return "SP-API Endpoint Region is required";
  if (!storeUrl.startsWith("https://")) return "SP-API Endpoint must be https";
  if (!marketplaceId) return "Marketplace is required";
  if (!clientId) return "LWA Client ID is required";
  if (!clientSecret) return "LWA Client Secret is required";
  if (!refreshToken) return "LWA Refresh Token is required";

  const marketplace = MARKETPLACE_MAP[marketplaceId];
  if (!marketplace) {
    return "Unknown or invalid Marketplace ID";
  }

  // Check if storeUrl is one of the valid SP-API endpoints
  const validEndpoints = Object.values(SP_API_ENDPOINTS);
  if (!validEndpoints.includes(storeUrl)) {
    return "Invalid SP-API Endpoint URL";
  }

  // Cross-Field validation: Ensure endpoint matches marketplace region
  const expectedEndpoint = SP_API_ENDPOINTS[marketplace.region];
  if (storeUrl !== expectedEndpoint) {
    return `Incorrect endpoint for ${marketplace.label}. Please select the ${marketplace.region.toUpperCase()} endpoint region.`;
  }

  return null;
}

export function buildConnectUrl(channelId: number, config: Record<string, string>, appUrl: string): string {
  void channelId; void config;
  const base = appUrl.replace(/\/$/, "");
  return `${base}/channels?connected=amazon`;
}



/**
 * Maps an Amazon SP-API catalog item payload to the standardized UI presentation record.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractProductFields(rawData: Record<string, any>): StandardizedProductRecord {
    const summaries     = Array.isArray(rawData.summaries)      ? rawData.summaries[0] || {}          : {};
    const attributesObj = Array.isArray(rawData.attributes)     ? rawData.attributes[0] || {}         : {};
    const dimensions    = Array.isArray(rawData.dimensions)     ? rawData.dimensions[0] || {}         : {};
    const relationships = Array.isArray(rawData.relationships)  ? rawData.relationships[0]?.relationships || [] : [];

    const rawImages = (Array.isArray(rawData.images) && rawData.images[0]?.images) ? rawData.images[0].images : [];
    const images = rawImages.map((img: { link?: string; variant?: string; width?: string | number; height?: string | number }) => ({
        link: img.link || "",
        variant: img.variant || "",
        width: img.width || "-",
        height: img.height || "-"
    }));

    return {
        name:         getNestedValue(summaries, "itemName") || getNestedValue(attributesObj, "item_name") || "",
        sku:          rawData.sku || "",
        stockQuantity: rawData.stockQuantity || "",
        brand:        getNestedValue(summaries, "brand")        || getNestedValue(attributesObj, "brand")        || rawData["brand-name"] || "",
        color:        getNestedValue(summaries, "color")        || getNestedValue(attributesObj, "color")        || "",
        partNumber:   getNestedValue(summaries, "partNumber")   || getNestedValue(attributesObj, "part_number")  || rawData.sku || "",
        manufacturer: getNestedValue(summaries, "manufacturer") || getNestedValue(attributesObj, "manufacturer") || "",
        description:  getNestedValue(attributesObj, "product_description") || "",
        itemTypeKw:   getNestedValue(attributesObj, "item_type_keyword") || "",
        category:     rawData.category || summaries?.browseClassification?.displayName || "",
        price:        rawData.price || "",
        itemCondition: rawData["item-condition"] || "New",
        pkgWeight:    getDimensionValue(dimensions, "package") || getDimensionValue(dimensions?.package, "weight") || "",
        itemWeight:   getDimensionValue(dimensions, "item")    || getDimensionValue(dimensions?.item, "weight") || "",
        images,
        relationships,
    };
}
