import type { ChannelCapabilities, ChannelConfigField } from "../types";

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
  if (!marketplaceId) return "Marketplace is required";
  if (!clientId) return "LWA Client ID is required";
  if (!clientSecret) return "LWA Client Secret is required";
  if (!refreshToken) return "LWA Refresh Token is required";

  // Cross-Field validation: Ensure endpoint matches marketplace region
  const marketplace = MARKETPLACE_MAP[marketplaceId];
  if (marketplace) {
    const expectedEndpoint = SP_API_ENDPOINTS[marketplace.region];
    if (storeUrl !== expectedEndpoint) {
      return `Incorrect endpoint for ${marketplace.label}. Please select the ${marketplace.region.toUpperCase()} endpoint region.`;
    }
  }

  return null;
}

export function buildConnectUrl(channelId: number, config: Record<string, string>, appUrl: string): string {
  void channelId; void config;
  const base = appUrl.replace(/\/$/, "");
  return `${base}/channels?connected=amazon`;
}
