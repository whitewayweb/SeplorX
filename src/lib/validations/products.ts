import { z } from "zod";

export const CreateProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  sku: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().optional().or(z.literal("")),
  category: z.string().trim().optional().or(z.literal("")),
  attributes: z.record(z.string(), z.string()).optional().default({}),
  unit: z.string().trim().min(1, "Unit is required"),
  purchasePrice: z.coerce.number().min(0, "Must be ≥ 0").optional().or(z.literal("")),
  sellingPrice: z.coerce.number().min(0, "Must be ≥ 0").optional().or(z.literal("")),
  reorderLevel: z.coerce.number().int().min(0, "Must be ≥ 0"),
  isBundle: z.coerce.boolean().default(false).optional(),
  components: z.array(z.object({
    componentProductId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive()
  })).optional().default([]),
});

export const UpdateProductSchema = CreateProductSchema.extend({
  id: z.coerce.number().int().positive("Invalid product ID"),
});

export const ProductIdSchema = z.object({
  id: z.coerce.number().int().positive("Invalid product ID"),
});

export const StockAdjustmentSchema = z.object({
  productId: z.coerce.number().int().positive("Invalid product ID"),
  quantity: z.coerce.number().int().refine((v) => v !== 0, "Quantity cannot be zero"),
  notes: z.string().trim().optional().or(z.literal("")),
});
