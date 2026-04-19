import { describe, it, expect } from "vitest";
import {
  CreateChannelSchema,
  UpdateChannelSchema,
  ChannelIdSchema,
  OfferInventoryTabSchema,
  ProductDetailsTabSchema,
  ChannelProductIdentifiersSchema,
} from "../channels";

// ─── CreateChannelSchema ──────────────────────────────────────────────────────

describe("CreateChannelSchema", () => {
  const validBase = { channelType: "woocommerce" as const, name: "My WooCommerce Store" };

  it("passes with valid woocommerce channel", () => {
    expect(CreateChannelSchema.safeParse(validBase).success).toBe(true);
  });

  it("passes with all valid channel types", () => {
    const types = ["woocommerce", "shopify", "amazon", "custom"] as const;
    for (const channelType of types) {
      expect(CreateChannelSchema.safeParse({ ...validBase, channelType }).success).toBe(true);
    }
  });

  it("fails with unknown channel type", () => {
    const result = CreateChannelSchema.safeParse({ ...validBase, channelType: "ebay" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/invalid channel type/i);
  });

  it("fails when name is empty", () => {
    const result = CreateChannelSchema.safeParse({ ...validBase, name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/required/i);
  });

  it("fails when name exceeds 255 characters", () => {
    const result = CreateChannelSchema.safeParse({ ...validBase, name: "a".repeat(256) });
    expect(result.success).toBe(false);
  });

  it("passes with valid https storeUrl", () => {
    const result = CreateChannelSchema.safeParse({ ...validBase, storeUrl: "https://mystore.com" });
    expect(result.success).toBe(true);
  });

  it("passes with valid http storeUrl (internal/dev stores)", () => {
    const result = CreateChannelSchema.safeParse({ ...validBase, storeUrl: "http://localhost:8080" });
    expect(result.success).toBe(true);
  });

  it("fails with malformed storeUrl (no protocol)", () => {
    const result = CreateChannelSchema.safeParse({ ...validBase, storeUrl: "mystore.com" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/valid url/i);
  });

  it("passes when storeUrl is omitted entirely", () => {
    expect(CreateChannelSchema.safeParse(validBase).success).toBe(true);
  });

  it("passes when storeUrl is empty string (treated as absent)", () => {
    const result = CreateChannelSchema.safeParse({ ...validBase, storeUrl: "" });
    expect(result.success).toBe(true);
  });

  it("passes when defaultPickupLocation is provided", () => {
    const result = CreateChannelSchema.safeParse({ ...validBase, defaultPickupLocation: "Warehouse A" });
    expect(result.success).toBe(true);
  });
});

// ─── UpdateChannelSchema ──────────────────────────────────────────────────────

describe("UpdateChannelSchema", () => {
  const validUpdate = { id: 1, name: "Renamed Store" };

  it("passes with valid id and name", () => {
    expect(UpdateChannelSchema.safeParse(validUpdate).success).toBe(true);
  });

  it("fails when id is zero", () => {
    const result = UpdateChannelSchema.safeParse({ ...validUpdate, id: 0 });
    expect(result.success).toBe(false);
  });

  it("fails when name is empty", () => {
    const result = UpdateChannelSchema.safeParse({ ...validUpdate, name: "" });
    expect(result.success).toBe(false);
  });
});

// ─── ChannelIdSchema ──────────────────────────────────────────────────────────

describe("ChannelIdSchema", () => {
  it("passes with a positive integer id", () => {
    expect(ChannelIdSchema.safeParse({ id: 5 }).success).toBe(true);
  });

  it("fails with id of zero", () => {
    expect(ChannelIdSchema.safeParse({ id: 0 }).success).toBe(false);
  });

  it("coerces string id to integer", () => {
    const result = ChannelIdSchema.safeParse({ id: "7" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe(7);
  });
});

// ─── OfferInventoryTabSchema ──────────────────────────────────────────────────

describe("OfferInventoryTabSchema", () => {
  it("passes with valid stock quantity", () => {
    expect(OfferInventoryTabSchema.safeParse({ stockQuantity: 50 }).success).toBe(true);
  });

  it("passes with zero stock quantity (out of stock)", () => {
    expect(OfferInventoryTabSchema.safeParse({ stockQuantity: 0 }).success).toBe(true);
  });

  it("fails when stockQuantity is negative", () => {
    const result = OfferInventoryTabSchema.safeParse({ stockQuantity: -1 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/cannot be negative/i);
  });

  it("fails when stockQuantity is a float", () => {
    const result = OfferInventoryTabSchema.safeParse({ stockQuantity: 1.5 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/whole number/i);
  });

  it("passes with valid price format (integer)", () => {
    expect(OfferInventoryTabSchema.safeParse({ price: "99" }).success).toBe(true);
  });

  it("passes with valid price format (2 decimal places)", () => {
    expect(OfferInventoryTabSchema.safeParse({ price: "99.99" }).success).toBe(true);
  });

  it("passes with valid price format (1 decimal place)", () => {
    expect(OfferInventoryTabSchema.safeParse({ price: "9.9" }).success).toBe(true);
  });

  it("fails with price containing letters", () => {
    const result = OfferInventoryTabSchema.safeParse({ price: "abc" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/valid price/i);
  });

  it("fails with price having more than 2 decimal places", () => {
    const result = OfferInventoryTabSchema.safeParse({ price: "9.999" });
    expect(result.success).toBe(false);
  });

  it("fails with price containing currency symbol", () => {
    const result = OfferInventoryTabSchema.safeParse({ price: "£9.99" });
    expect(result.success).toBe(false);
  });

  it("passes empty string price (field cleared)", () => {
    expect(OfferInventoryTabSchema.safeParse({ price: "" }).success).toBe(true);
  });

  it("passes with valid itemCondition", () => {
    expect(OfferInventoryTabSchema.safeParse({ itemCondition: "New" }).success).toBe(true);
  });
});

// ─── ProductDetailsTabSchema ──────────────────────────────────────────────────

describe("ProductDetailsTabSchema", () => {
  it("passes with valid name", () => {
    expect(ProductDetailsTabSchema.safeParse({ name: "Great Product" }).success).toBe(true);
  });

  it("fails with empty name", () => {
    const result = ProductDetailsTabSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("fails when name exceeds 500 characters", () => {
    const result = ProductDetailsTabSchema.safeParse({ name: "a".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("passes with all optional fields present", () => {
    const result = ProductDetailsTabSchema.safeParse({
      name: "Widget",
      description: "A useful widget",
      brand: "BrandCo",
      manufacturer: "ManufactCo",
      partNumber: "PN-001",
      color: "Red",
      itemTypeKw: "hand-tool",
      pkgWeight: "0.5 kg",
      itemWeight: "0.4 kg",
      category: "Tools",
    });
    expect(result.success).toBe(true);
  });
});

// ─── ChannelProductIdentifiersSchema ─────────────────────────────────────────

describe("ChannelProductIdentifiersSchema", () => {
  const validIds = { id: 1, channelId: 2, externalId: "ext-product-123" };

  it("passes with valid identifiers", () => {
    expect(ChannelProductIdentifiersSchema.safeParse(validIds).success).toBe(true);
  });

  it("fails when externalId is empty string", () => {
    const result = ChannelProductIdentifiersSchema.safeParse({ ...validIds, externalId: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/required/i);
  });

  it("fails when id is negative", () => {
    const result = ChannelProductIdentifiersSchema.safeParse({ ...validIds, id: -1 });
    expect(result.success).toBe(false);
  });

  it("fails when channelId is zero", () => {
    const result = ChannelProductIdentifiersSchema.safeParse({ ...validIds, channelId: 0 });
    expect(result.success).toBe(false);
  });

  it("coerces id from numeric string", () => {
    const result = ChannelProductIdentifiersSchema.safeParse({ ...validIds, id: "10" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe(10);
  });

  it("fails when externalId exceeds 255 characters", () => {
    const result = ChannelProductIdentifiersSchema.safeParse({ ...validIds, externalId: "a".repeat(256) });
    expect(result.success).toBe(false);
  });
});
