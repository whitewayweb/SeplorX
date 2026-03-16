import { describe, it, expect } from "vitest";
import { woocommerceHandler, buildWcPayload } from "../index";

describe("WooCommerce Handler Mapping", () => {
  const existingRawData = {
    id: 123,
    name: "Original Name",
    regular_price: "100.00",
    weight: "1.5",
    description: "Old description",
    "brand-name": "Old Brand",
  };

  describe("mergeProductUpdate", () => {
    it("should merge basic fields into rawData using FIELD_MAP", () => {
      const patch = {
        price: "150.00",
        itemWeight: "2.0",
        description: "New description",
      };

      const result = woocommerceHandler.mergeProductUpdate!(existingRawData, patch);

      expect(result).toMatchObject({
        regular_price: "150.00",
        weight: "2.0",
        description: "New description",
        "brand-name": "Old Brand", // Unchanged
      });
    });

    it("should pass through unmapped fields as-is", () => {
      const patch = {
        custom_field: "some value",
      };

      const result = woocommerceHandler.mergeProductUpdate!(existingRawData, patch);
      expect(result).toMatchObject({
        custom_field: "some value",
      });
    });

    it("should not merge standard DB fields (name, sku, stockQuantity) into rawData if they are not in FIELD_MAP", () => {
      const patch = {
        name: "New Name",
        stockQuantity: 50,
      };

      const result = woocommerceHandler.mergeProductUpdate!(existingRawData, patch);
      expect(result?.name).toBe("New Name"); 
    });
  });

  describe("buildWcPayload", () => {
    it("should map delta fields to WooCommerce API keys", () => {
      const delta = {
        name: "New Product Name",
        stockQuantity: 10,
        price: "199.99",
        itemWeight: "5.5",
        description: "New description",
      };

      const result = buildWcPayload(delta as Record<string, unknown>);

      expect(result).toEqual({
        name: "New Product Name",
        manage_stock: true,
        stock_quantity: 10,
        regular_price: "199.99",
        weight: "5.5",
        description: "New description",
      });
    });

    it("should stringify price and weight", () => {
      const delta = {
        price: 150, // as number
        itemWeight: 2.5, // as number
      };

      const result = buildWcPayload(delta as Record<string, unknown>);

      expect(result.regular_price).toBe("150");
      expect(result.weight).toBe("2.5");
    });
  });
});
