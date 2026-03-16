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

export const ChannelMappingIdSchema = z.object({
  id: z.coerce.number().int().positive("Invalid mapping ID"),
});

export const UpdateChannelSchema = z.object({
  id: z.coerce.number().int().positive("Invalid channel ID"),
  name: z.string().trim().min(1, "Channel name is required").max(255),
  defaultPickupLocation: z.string().trim().optional().or(z.literal("")),
});

// ── Channel product update (product-detail-tabs form) ─────────────────────────
// The form is tabbed; only fields from the active tab are submitted.
// We validate each tab independently using .partial() so absent fields are OK.

export const ProductDetailsTabSchema = z.object({
  name:          z.string().trim().min(1, "Product name is required").max(500, "Name too long"),
  description:   z.string().trim().optional().or(z.literal("")),
  brand:         z.string().trim().max(100, "Brand name too long").optional().or(z.literal("")),
  manufacturer:  z.string().trim().max(100, "Manufacturer name too long").optional().or(z.literal("")),
  partNumber:    z.string().trim().max(100, "Part number too long").optional().or(z.literal("")),
  color:         z.string().trim().max(50, "Color name too long").optional().or(z.literal("")),
  itemTypeKw:    z.string().trim().max(100, "Item type keyword too long").optional().or(z.literal("")),
  pkgWeight:     z.string().trim().max(50, "Weight string too long").optional().or(z.literal("")),
  itemWeight:    z.string().trim().max(50, "Weight string too long").optional().or(z.literal("")),
  category:      z.string().trim().max(255, "Category too long").optional().or(z.literal("")),
});

export const OfferInventoryTabSchema = z.object({
  sku:           z.string().trim().max(100, "SKU too long").optional().or(z.literal("")),
  price:         z.string().trim().regex(/^\d*(\.\d{1,2})?$/, "Must be a valid price (e.g. 99.99)").optional().or(z.literal("")),
  stockQuantity: z.coerce.number().int("Must be a whole number").min(0, "Stock cannot be negative").optional(),
  itemCondition: z.string().trim().max(100, "Condition too long").optional().or(z.literal("")),
});

// ── Channel product identifiers — extracted from untrusted FormData ───────────
// These control which DB rows are mutated and must be validated at the action boundary.
export const ChannelProductIdentifiersSchema = z.object({
  id:         z.coerce.number().int().positive("Invalid product ID"),
  channelId:  z.coerce.number().int().positive("Invalid channel ID"),
  externalId: z.string().trim().min(1, "External ID is required").max(255),
});
