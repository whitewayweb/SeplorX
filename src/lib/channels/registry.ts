import type { ChannelDefinition, ChannelHandler, ChannelType } from "./types";
import { woocommerceHandler } from "./woocommerce";
import { amazonHandler } from "./amazon";

export const channelRegistry: ChannelDefinition[] = [
  {
    id: "woocommerce",
    name: "WooCommerce",
    description: "Sync orders from your WooCommerce / WordPress store.",
    icon: "/channels/woocommerce.svg",
    authType: "oauth",
    popular: true,
    available: true,
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Connect your Shopify storefront to manage orders.",
    icon: null,
    authType: "oauth",
    popular: true,
    available: false,
  },
  {
    id: "amazon",
    name: "Amazon",
    description: "Pull orders from Amazon Seller Central.",
    icon: null,
    authType: "apikey",
    popular: true,
    available: true,
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

export function getChannelById(id: ChannelType): ChannelDefinition | undefined {
  return channelRegistry.find((c) => c.id === id);
}

/**
 * Returns the runtime handler for a channel type, or null if the channel
 * is not yet implemented. Add new channels here as they are built.
 */
export function getChannelHandler(type: string): ChannelHandler | null {
  switch (type) {
    case "woocommerce":
      return woocommerceHandler;
    case "amazon":
      return amazonHandler;
    default:
      return null;
  }
}
