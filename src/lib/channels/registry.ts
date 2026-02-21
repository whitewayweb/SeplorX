import type { ChannelDefinition, ChannelType } from "./types";

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
    available: false,
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

function getPopularChannels(): ChannelDefinition[] {
  return channelRegistry.filter((c) => c.popular);
}
