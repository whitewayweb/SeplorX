export type ChannelType = "woocommerce" | "shopify" | "amazon" | "custom";

export interface ChannelDefinition {
  id: ChannelType;
  name: string;
  description: string;
  /** Path under /public/channels/, or null to show a placeholder icon */
  icon: string | null;
  authType: "oauth" | "apikey";
  popular: boolean;
  /** If true, channel is implemented and can be connected */
  available: boolean;
}

export type ChannelStatus = "pending" | "connected" | "disconnected";

export interface ChannelInstance {
  id: number;
  channelType: string;
  name: string;
  status: ChannelStatus;
  storeUrl: string | null;
  defaultPickupLocation: string | null;
  createdAt: Date | null;
}
