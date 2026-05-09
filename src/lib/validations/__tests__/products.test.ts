import { describe, it, expect } from "vitest";
import { CreateProductSchema, UpdateProductSchema, StockAdjustmentSchema } from "../products";

// ─── CreateProductSchema ──────────────────────────────────────────────────────

describe("CreateProductSchema", () => {
  const validBase = { name: "Widget", unit: "pcs", purchasePrice: 10.99, reorderLevel: 0 };

  it("passes with valid minimal data", () => {
    const result = CreateProductSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("fails when a simple product has no purchasePrice", () => {
    const withoutPurchasePrice = { ...validBase } as Partial<typeof validBase>;
    delete withoutPurchasePrice.purchasePrice;
    const result = CreateProductSchema.safeParse(withoutPurchasePrice);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/purchase price is required/i);
  });

  it("passes with all optional fields provided", () => {
    const result = CreateProductSchema.safeParse({
      ...validBase,
      sku: "SKU-001",
      description: "A great widget",
      category: "Tools",
      purchasePrice: 10.99,
      sellingPrice: 15.00,
      reorderLevel: 5,
    });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from name", () => {
    const result = CreateProductSchema.safeParse({ ...validBase, name: "  Widget  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Widget");
  });

  it("fails when name is empty string", () => {
    const result = CreateProductSchema.safeParse({ ...validBase, name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/required/i);
  });

  it("fails when name is only whitespace", () => {
    const result = CreateProductSchema.safeParse({ ...validBase, name: "   " });
    expect(result.success).toBe(false);
  });

  it("fails when unit is empty string", () => {
    const result = CreateProductSchema.safeParse({ ...validBase, unit: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/required/i);
  });

  it("fails when reorderLevel is negative", () => {
    const result = CreateProductSchema.safeParse({ ...validBase, reorderLevel: -1 });
    expect(result.success).toBe(false);
  });

  it("fails when reorderLevel is a float", () => {
    const result = CreateProductSchema.safeParse({ ...validBase, reorderLevel: 1.5 });
    expect(result.success).toBe(false);
  });

  it("passes when reorderLevel is 0 (boundary)", () => {
    const result = CreateProductSchema.safeParse({ ...validBase, reorderLevel: 0 });
    expect(result.success).toBe(true);
  });

  it("coerces purchasePrice from numeric string", () => {
    const result = CreateProductSchema.safeParse({ ...validBase, purchasePrice: "12.50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.purchasePrice).toBe(12.5);
  });

  it("fails when purchasePrice is negative", () => {
    const result = CreateProductSchema.safeParse({ ...validBase, purchasePrice: -1 });
    expect(result.success).toBe(false);
  });

  it("passes when purchasePrice is 0 (free item)", () => {
    const result = CreateProductSchema.safeParse({ ...validBase, purchasePrice: 0 });
    expect(result.success).toBe(true);
  });

  describe("Price Fields Validation", () => {
    it("fails when purchasePrice is empty for a simple product", () => {
      const result = CreateProductSchema.safeParse({ ...validBase, purchasePrice: "" });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toMatch(/purchase price is required/i);
    });

    it("handles null for sellingPrice by treating it as undefined (valid optional)", () => {
      const result = CreateProductSchema.safeParse({ ...validBase, sellingPrice: null });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.sellingPrice).toBeUndefined();
    });

    it("fails when purchasePrice is explicitly invalid string", () => {
      const result = CreateProductSchema.safeParse({ ...validBase, purchasePrice: "abc" });
      expect(result.success).toBe(false);
    });
  });

  it("allows empty-string sku (treated as absent)", () => {
    const result = CreateProductSchema.safeParse({ ...validBase, sku: "" });
    expect(result.success).toBe(true);
  });

  describe("Bundle Validation", () => {
    it("fails when isBundle is true but components list is empty", () => {
      const result = CreateProductSchema.safeParse({
        ...validBase,
        isBundle: true,
        components: []
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toMatch(/at least one valid component/i);
    });

    it("passes when isBundle is true and has valid components", () => {
      const bundleBase = { ...validBase } as Partial<typeof validBase>;
      delete bundleBase.purchasePrice;
      const result = CreateProductSchema.safeParse({
        ...bundleBase,
        isBundle: true,
        components: [{ componentProductId: 10, quantity: 2 }]
      });
      expect(result.success).toBe(true);
    });

    it("passes when isBundle is false even if components are empty (default)", () => {
      const result = CreateProductSchema.safeParse({
        ...validBase,
        isBundle: false,
        components: []
      });
      expect(result.success).toBe(true);
    });

    it("fails when isBundle is true and has duplicate component IDs", () => {
      const result = CreateProductSchema.safeParse({
        ...validBase,
        isBundle: true,
        components: [
          { componentProductId: 10, quantity: 2 },
          { componentProductId: 10, quantity: 5 } // duplicate ID
        ]
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toMatch(/duplicate components/i);
    });
  });
});

// ─── UpdateProductSchema ──────────────────────────────────────────────────────

describe("UpdateProductSchema", () => {
  const validUpdate = { id: 1, name: "Widget", unit: "pcs", purchasePrice: 10.99, reorderLevel: 0 };

  it("passes with valid id included", () => {
    expect(UpdateProductSchema.safeParse(validUpdate).success).toBe(true);
  });

  it("fails when id is missing", () => {
    const withoutId = { ...validUpdate } as Record<string, unknown>;
    delete withoutId.id;
    expect(UpdateProductSchema.safeParse(withoutId).success).toBe(false);
  });

  it("fails when id is zero", () => {
    const result = UpdateProductSchema.safeParse({ ...validUpdate, id: 0 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/invalid product id/i);
  });

  it("fails when id is negative", () => {
    const result = UpdateProductSchema.safeParse({ ...validUpdate, id: -5 });
    expect(result.success).toBe(false);
  });

  it("coerces id from string", () => {
    const result = UpdateProductSchema.safeParse({ ...validUpdate, id: "42" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe(42);
  });

  describe("Bundle Validation (Update)", () => {
    it("fails when updating a bundle to include itself as a component", () => {
      const result = UpdateProductSchema.safeParse({
        ...validUpdate,
        isBundle: true,
        components: [{ componentProductId: validUpdate.id, quantity: 1 }]
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toMatch(/cannot contain itself/i);
    });
  });
});

// ─── StockAdjustmentSchema ────────────────────────────────────────────────────

describe("StockAdjustmentSchema", () => {
  const validAdjust = { productId: 1, quantity: 5 };

  it("passes with valid positive integer quantity", () => {
    expect(StockAdjustmentSchema.safeParse(validAdjust).success).toBe(true);
  });

  it("passes with valid negative integer (write-off / remove stock)", () => {
    expect(StockAdjustmentSchema.safeParse({ ...validAdjust, quantity: -3 }).success).toBe(true);
  });

  it("fails when quantity is zero", () => {
    const result = StockAdjustmentSchema.safeParse({ ...validAdjust, quantity: 0 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/cannot be zero/i);
  });

  it("fails when quantity is a float", () => {
    const result = StockAdjustmentSchema.safeParse({ ...validAdjust, quantity: 1.5 });
    expect(result.success).toBe(false);
  });

  it("accepts optional notes field", () => {
    const result = StockAdjustmentSchema.safeParse({ ...validAdjust, notes: "Damaged goods" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.notes).toBe("Damaged goods");
  });

  it("fails when productId is zero", () => {
    const result = StockAdjustmentSchema.safeParse({ ...validAdjust, productId: 0 });
    expect(result.success).toBe(false);
  });

  it("fails when productId is negative", () => {
    const result = StockAdjustmentSchema.safeParse({ ...validAdjust, productId: -1 });
    expect(result.success).toBe(false);
  });
});
