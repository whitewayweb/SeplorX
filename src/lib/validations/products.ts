import { z } from "zod";

export const CreateProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  sku: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().optional().or(z.literal("")),
  category: z.string().trim().optional().or(z.literal("")),
  attributes: z.record(z.string(), z.string()).optional().default({}),
  unit: z.string().trim().min(1, "Unit is required"),
  purchasePrice: z.preprocess((val) => (val === "" || val === null ? undefined : val), z.coerce.number().min(0, "Must be ≥ 0").optional()),
  sellingPrice: z.preprocess((val) => (val === "" || val === null ? undefined : val), z.coerce.number().min(0, "Must be ≥ 0").optional()),
  reorderLevel: z.preprocess((val) => (val === "" || val === null ? 0 : val), z.coerce.number().int().min(0, "Must be ≥ 0")),
  isBundle: z.coerce.boolean().default(false).optional(),
  components: z.array(z.object({
    componentProductId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive()
  })).optional().default([]),
}).refine(data => !data.isBundle || data.components.length > 0, {
  message: "A bundle must have at least one valid component",
  path: ["components"]
}).refine(data => {
  if (data.isBundle && data.components.length > 0) {
    // Check for direct self-reference if id were available (but it's not in CreateProductSchema)
    // However, we can check for duplicate component IDs
    const ids = data.components.map(c => c.componentProductId);
    return new Set(ids).size === ids.length;
  }
  return true;
}, {
  message: "Duplicate components are not allowed",
  path: ["components"]
});

export const UpdateProductSchema = CreateProductSchema.extend({
  id: z.coerce.number().int().positive("Invalid product ID"),
}).refine(data => {
  if (data.isBundle && data.components.some(c => c.componentProductId === data.id)) {
    return false;
  }
  return true;
}, {
  message: "A bundle cannot contain itself",
  path: ["components"]
});

export const ProductIdSchema = z.object({
  id: z.coerce.number().int().positive("Invalid product ID"),
});

export const StockAdjustmentSchema = z.object({
  productId: z.coerce.number().int().positive("Invalid product ID"),
  quantity: z.coerce.number().int().refine((v) => v !== 0, "Quantity cannot be zero"),
  notes: z.string().trim().optional().or(z.literal("")),
});
