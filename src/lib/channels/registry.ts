import type { ChannelDefinition } from "./types";
import * as woocommerceConfig from "./woocommerce/config";
import * as amazonConfig from "./amazon/config";

export const channelRegistry: ChannelDefinition[] = [
  {
    id: "woocommerce",
    name: "WooCommerce",
    description: "Sync orders from your WooCommerce / WordPress store.",
    icon: "/channels/woocommerce.svg",
    authType: "oauth",
    popular: true,
    available: true,
    color: "#96588A",
    ...woocommerceConfig,
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Connect your Shopify storefront to manage orders.",
    icon: null,
    authType: "oauth",
    popular: true,
    available: false,
    color: "#96bf48",
  },
  {
    id: "amazon",
    name: "Amazon",
    description: "Pull data from Amazon Seller Central.",
    icon: "/channels/amazon.png",
    authType: "apikey",
    popular: true,
    available: true,
    color: "#FF9900",
    ...amazonConfig,
  },
  {
    id: "custom",
    name: "Custom",
    description: "Connect any order source via webhook.",
    icon: null,
    authType: "apikey",
    popular: false,
    available: false,
  },
];

export function getChannelById(id?: string | null): ChannelDefinition | undefined {
  if (!id) return undefined;
  return channelRegistry.find((c) => c.id.toLowerCase() === id.toLowerCase());
}


