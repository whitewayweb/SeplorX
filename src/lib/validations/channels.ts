import { z } from "zod";

const channelTypes = ["woocommerce", "shopify", "amazon", "custom"] as const;

export const CreateChannelSchema = z
  .object({
    channelType: z.enum(channelTypes, { message: "Invalid channel type" }),
    name: z.string().trim().min(1, "Channel name is required").max(255),
    storeUrl: z
      .string()
      .trim()
      .url("Must be a valid URL")
      .optional()
      .or(z.literal("")),
    defaultPickupLocation: z.string().trim().optional().or(z.literal("")),
  })
  .refine(
    (data) => data.channelType !== "woocommerce" || !!data.storeUrl,
    { message: "Store URL is required for WooCommerce", path: ["storeUrl"] },
  );

export const ChannelIdSchema = z.object({
  id: z.coerce.number().int().positive("Invalid channel ID"),
});
