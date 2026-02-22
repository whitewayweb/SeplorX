import { z } from "zod";

const channelTypes = ["woocommerce", "shopify", "amazon", "custom"] as const;

// Channel-type-specific validation is handled by ChannelHandler.validateConfig().
// This schema validates the common fields shared by all channel types.
export const CreateChannelSchema = z.object({
  channelType: z.enum(channelTypes, { message: "Invalid channel type" }),
  name: z.string().trim().min(1, "Channel name is required").max(255),
  storeUrl: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  defaultPickupLocation: z.string().trim().optional().or(z.literal("")),
});

export const ChannelIdSchema = z.object({
  id: z.coerce.number().int().positive("Invalid channel ID"),
});

export const ChannelMappingSchema = z.object({
  channelId: z.coerce.number().int().positive("Invalid channel ID"),
  productId: z.coerce.number().int().positive("Invalid product ID"),
  externalProductId: z
    .string()
    .trim()
    .min(1, "WooCommerce product ID is required")
    .max(100),
  label: z.string().trim().max(255).optional().or(z.literal("")),
});

export const ChannelMappingIdSchema = z.object({
  id: z.coerce.number().int().positive("Invalid mapping ID"),
});
