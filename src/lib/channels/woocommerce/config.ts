import type { ChannelCapabilities, ChannelConfigField, StandardizedProductRecord } from "../types";

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractProductFields(rawData: Record<string, any>): StandardizedProductRecord {
    const isWoo = Array.isArray(rawData.attributes);
    
    // WooCommerce fallback attribute getter
    const getWooAttr = (name: string) => {
        if (!isWoo) return "";
        const attr = rawData.attributes.find((a: { name?: string; options?: string[] }) => a.name?.toLowerCase() === name.toLowerCase());
        return attr?.options?.[0] || "";
    };

    const description = rawData.description?.replace(/(<([^>]+)>)/gi, "") 
        || rawData.short_description?.replace(/(<([^>]+)>)/gi, "") 
        || "";

    const category = Array.isArray(rawData.categories) 
        ? rawData.categories.map((c: { name?: string }) => c.name).join(", ") 
        : "";

    const rawImages = Array.isArray(rawData.images) ? rawData.images : [];
    const images = rawImages.map((img: { src?: string; link?: string; name?: string; alt?: string; variant?: string; width?: string | number; height?: string | number }) => ({
        link: img.src || img.link || "",
        variant: img.name || img.alt || img.variant || "",
        width: img.width || "-",
        height: img.height || "-"
    }));

    return {
        brand:        getWooAttr("brand") || rawData["brand-name"] || "",
        color:        getWooAttr("color"),
        partNumber:   getWooAttr("part_number") || rawData.sku || "",
        manufacturer: getWooAttr("manufacturer"),
        description:  description,
        itemTypeKw:   "",
        category:     category,
        price:        rawData.price || rawData.regular_price || "",
        itemCondition: rawData["item-condition"] || "New",
        pkgWeight:    rawData.weight ? `${rawData.weight} kg` : "",
        itemWeight:   rawData.weight ? `${rawData.weight} kg` : "",
        images,
        relationships: [],
    };
}
