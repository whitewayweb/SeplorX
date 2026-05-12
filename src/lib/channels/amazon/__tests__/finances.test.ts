import { describe, expect, it } from "vitest";

import { normalizeAmazonFinanceTransactions } from "../finances";

describe("normalizeAmazonFinanceTransactions", () => {
  it("classifies Amazon Finances v2024-06-19 order components", () => {
    const [event] = normalizeAmazonFinanceTransactions(
      [
        {
          transactionId: "txn-1",
          transactionType: "Shipment",
          transactionStatus: "Released",
          postedDate: "2026-01-10T12:00:00Z",
          totalAmount: { currencyCode: "INR", currencyAmount: 899 },
          breakdowns: [
            {
              breakdownType: "TDS",
              breakdownAmount: { currencyCode: "INR", currencyAmount: -9 },
            },
            {
              breakdownType: "TechnologyFee",
              breakdownAmount: { currencyCode: "INR", currencyAmount: -12 },
            },
          ],
          items: [
            {
              contexts: [{ sku: "SKU-1", quantityShipped: 2 }],
              relatedIdentifiers: [
                {
                  itemRelatedIdentifierName: "ORDER_ITEM_ID",
                  itemRelatedIdentifierValue: "oi-1",
                },
              ],
              breakdowns: [
                {
                  breakdownType: "Principal",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: 799 },
                },
                {
                  breakdownType: "Tax",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: 100 },
                },
                {
                  breakdownType: "FBAPerUnitFulfillmentFee",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: -45 },
                },
                {
                  breakdownType: "Commission",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: -75 },
                },
                {
                  breakdownType: "FixedClosingFee",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: -20 },
                },
                {
                  breakdownType: "MysteryComponent",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: -3 },
                },
              ],
            },
          ],
        },
      ],
      "403-5542327-2830729",
    );

    expect(event.dedupeKey).toBe("txn-1");
    expect(event.sourceApiVersion).toBe("finances/2024-06-19");
    expect(event.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amountRole: "principal", code: "Principal", amount: "799.00" }),
        expect.objectContaining({ amountRole: "tax", code: "Tax", amount: "100.00" }),
        expect.objectContaining({ amountRole: "marketplace_fee", code: "FBAPerUnitFulfillmentFee", amount: "-45.00" }),
        expect.objectContaining({ amountRole: "marketplace_fee", code: "Commission", amount: "-75.00" }),
        expect.objectContaining({ amountRole: "marketplace_fee", code: "TechnologyFee", amount: "-12.00" }),
        expect.objectContaining({ amountRole: "marketplace_fee", code: "FixedClosingFee", amount: "-20.00" }),
        expect.objectContaining({ amountRole: "withholding", code: "TDS", amount: "-9.00" }),
        expect.objectContaining({ amountRole: "other", code: "MysteryComponent", amount: "-3.00" }),
      ]),
    );
    expect(event.components.find((component) => component.code === "Principal")).toMatchObject({
      externalItemId: "oi-1",
      sku: "SKU-1",
      quantity: 2,
    });
  });

  it("classifies refund transactions as refund amounts", () => {
    const [event] = normalizeAmazonFinanceTransactions(
      [
        {
          transactionId: "refund-1",
          transactionType: "Refund",
          items: [
            {
              breakdowns: [
                {
                  breakdownType: "Principal",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: -100 },
                },
              ],
            },
          ],
        },
      ],
      "403-5542327-2830729",
    );

    expect(event.components).toEqual([
      expect.objectContaining({ amountRole: "refund", amount: "-100.00" }),
    ]);
  });
});
