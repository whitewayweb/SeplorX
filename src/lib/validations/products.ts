import { z } from "zod";

export const CreateProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  sku: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().optional().or(z.literal("")),
  category: z.string().trim().optional().or(z.literal("")),
  unit: z.string().trim().min(1, "Unit is required"),
  purchasePrice: z.coerce.number().min(0, "Must be ≥ 0").optional().or(z.literal("")),
  sellingPrice: z.coerce.number().min(0, "Must be ≥ 0").optional().or(z.literal("")),
  reorderLevel: z.coerce.number().int().min(0, "Must be ≥ 0"),
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
