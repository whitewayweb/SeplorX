import type { ChannelHandler } from "./types";
import { woocommerceHandler } from "./woocommerce";
import { amazonHandler } from "./amazon";

/**
 * Returns the runtime server-side handler for a channel type, or null if the channel
 * is not yet implemented. Add new channels here as they are built.
 * Do not import this in client components, as handlers include node dependencies.
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
