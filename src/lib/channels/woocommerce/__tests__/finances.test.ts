import { describe, expect, it } from "vitest";

import { normalizeWooCommerceFinanceOrder } from "../finances";
import type { ShopOrder } from "../api/types/wcorderSchema";

describe("normalizeWooCommerceFinanceOrder", () => {
  it("normalizes WooCommerce order payload finance fields without turning fee lines into marketplace costs", () => {
    const [event] = normalizeWooCommerceFinanceOrder(
      {
        id: 101,
        status: "completed",
        currency: "GBP",
        date_modified_gmt: "2026-02-03T10:30:00",
        discount_total: "5.00",
        line_items: [
          {
            id: 501,
            sku: "SKU-1",
            quantity: 2,
            total: "40.00",
            total_tax: "8.00",
          },
        ],
        shipping_lines: [
          {
            id: 601,
            total: "4.00",
            total_tax: "0.80",
          },
        ],
        fee_lines: [
          {
            id: 701,
            total: "2.50",
            total_tax: "0.50",
          },
        ],
        refunds: [
          {
            id: 801,
            total: "10.00",
          },
        ],
      } as unknown as ShopOrder,
      "wc-101",
    );

    expect(event.dedupeKey).toBe("woocommerce:wc-101");
    expect(event.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amountRole: "principal", code: "line_total", amount: "40.00" }),
        expect.objectContaining({ amountRole: "tax", code: "line_total_tax", amount: "8.00" }),
        expect.objectContaining({ amountRole: "shipping_revenue", code: "shipping_total", amount: "4.00" }),
        expect.objectContaining({ amountRole: "order_fee_revenue", code: "fee_total", amount: "2.50" }),
        expect.objectContaining({ amountRole: "discount", code: "discount_total", amount: "-5.00" }),
        expect.objectContaining({ amountRole: "refund", code: "refund_total", amount: "-10.00" }),
      ]),
    );
    expect(event.components.some((component) => component.amountRole === "marketplace_fee")).toBe(false);
  });
});
