import type { ChannelCapabilities, ChannelConfigField, StandardizedProductRecord } from "../types";
import { Product as WCProduct } from "./api/types/wcproductSchema";

export const configFields: ChannelConfigField[] = [
  {
    key: "storeUrl",
    label: "Store URL",
    type: "url",
    required: true,
    placeholder: "https://yourstore.com",
  },
];

export const capabilities: ChannelCapabilities = {
  canFetchProducts: true,
  canPushStock: true,
  usesWebhooks: true,
};

export function validateConfig(config: Partial<Record<string, string>>): string | null {
  if (!config.storeUrl) return "Store URL is required for WooCommerce";
  try {
    const url = new URL(config.storeUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Store URL must start with http:// or https://";
    }
  } catch {
    return "Store URL must be a valid URL";
  }
  return null;
}

export function buildConnectUrl(channelId: number, config: Record<string, string>, appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  const storeBase = new URL(config.storeUrl!).origin;
  const params = new URLSearchParams({
    app_name: "SeplorX",
    scope: "read_write",
    user_id: String(channelId),
    return_url: `${base}/channels?connected=woocommerce`,
    callback_url: `${base}/api/channels/woocommerce/callback`,
  });
  return `${storeBase}/wc-auth/v1/authorize?${params}`;
}

export function getProductUrl(externalId: string, credentials?: Record<string, string>, rawData?: unknown): string | null {
  const data = rawData as { permalink?: string } | undefined;
  // 1. Prefer the actual permalink stored in raw_data if it exists
  if (data?.permalink) return data.permalink;

  // 2. Fallback to storeUrl + query param
  const storeUrl = credentials?.storeUrl;
  if (!storeUrl) return null;
  return `${storeUrl.replace(/\/$/, "")}/?p=${externalId}`;
}



/**
 * Maps a WooCommerce product payload to the standardized UI presentation record.
 */
export function extractProductFields(rawData: WCProduct): StandardizedProductRecord {
    // WooCommerce fallback attribute getter
    const getWooAttr = (name: string) => {
        if (!Array.isArray(rawData.attributes)) return "";
        const attr = rawData.attributes.find((a) => a.name?.toLowerCase() === name.toLowerCase());
        return (attr?.options?.[0] as string) || "";
    };

    // 1. Description: strip HTML tags but preserve some spacing, fallback to SEO meta if possible
    let description = rawData.description || rawData.short_description || "";
    if (description) {
        description = description
            .replace(/<\/p>/gi, "\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/(<([^>]+)>)/gi, "")
            .replace(/&nbsp;/g, " ")
            .trim();
    }
    
    // Check for Yoast SEO description in meta_data if not found in main fields
    if (!description && Array.isArray(rawData.meta_data)) {
        const yoastDesc = rawData.meta_data.find(m => m.key === "_yoast_wpseo_metadesc");
        if (yoastDesc?.value && typeof yoastDesc.value === "string") {
            description = yoastDesc.value;
        }
    }

    // 2. Category: handle array of objects
    const category = Array.isArray(rawData.categories) 
        ? rawData.categories.map((c) => c.name).filter(Boolean).join(", ") 
        : "";

    // 3. Brand: check attributes, brand-name, or the common "brands" taxonomy array populated by plugins
    let brand = getWooAttr("brand") || (rawData["brand-name"] as string) || "";
    if (!brand && Array.isArray(rawData.brands) && rawData.brands.length > 0) {
        const firstBrand = rawData.brands[0];
        brand = (typeof firstBrand === "object" && firstBrand !== null ? firstBrand.name : String(firstBrand)) || "";
    }

    const rawImages = Array.isArray(rawData.images) ? rawData.images : [];
    const images = rawImages.map((img) => ({
        link: img.src || "",
        variant: img.name || img.alt || "",
        width: img.width ? String(img.width) : "-",
        height: img.height ? String(img.height) : "-"
    }));

    return {
        brand:        brand,
        color:        getWooAttr("color"),
        partNumber:   getWooAttr("part_number") || rawData.sku || "",
        manufacturer: getWooAttr("manufacturer") || getWooAttr("Brand") || "",
        description:  description,
        itemTypeKw:   "",
        category:     category,
        price:        rawData.price || rawData.regular_price || "",
        itemCondition: (rawData["item-condition"] as string) || "New",
        pkgWeight:    rawData.weight ? `${rawData.weight} kg` : "",
        itemWeight:   rawData.weight ? `${rawData.weight} kg` : "",
        images,
        relationships: [],
    };
}
