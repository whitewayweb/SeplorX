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

  it("does not double count nested Amazon rollup breakdowns", () => {
    const [event] = normalizeAmazonFinanceTransactions(
      [
        {
          transactionId: "shipment-1",
          transactionType: "Shipment",
          totalAmount: { currencyCode: "INR", currencyAmount: 1400.83 },
          breakdowns: [
            {
              breakdownType: "Sales",
              breakdownAmount: { currencyCode: "INR", currencyAmount: 1849 },
              breakdowns: [
                {
                  breakdownType: "ProductCharges",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: 1566.95 },
                },
                {
                  breakdownType: "Tax",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: 282.05 },
                },
              ],
            },
          ],
          items: [
            {
              contexts: [{ sku: "SKU-1", quantityShipped: 1 }],
              relatedIdentifiers: [
                {
                  itemRelatedIdentifierName: "ORDER_ADJUSTMENT_ITEM_ID",
                  itemRelatedIdentifierValue: "item-1",
                },
              ],
              breakdowns: [
                {
                  breakdownType: "ProductCharges",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: 1566.95 },
                  breakdowns: [
                    {
                      breakdownType: "OurPricePrincipal",
                      breakdownAmount: { currencyCode: "INR", currencyAmount: 1566.95 },
                    },
                  ],
                },
                {
                  breakdownType: "AmazonFees",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: -438.77 },
                  breakdowns: [
                    {
                      breakdownType: "Commission",
                      breakdownAmount: { currencyCode: "INR", currencyAmount: -349.09 },
                      breakdowns: [
                        {
                          breakdownType: "Base",
                          breakdownAmount: { currencyCode: "INR", currencyAmount: -295.84 },
                        },
                        {
                          breakdownType: "Tax",
                          breakdownAmount: { currencyCode: "INR", currencyAmount: -53.25 },
                        },
                      ],
                    },
                    {
                      breakdownType: "FixedClosingFee",
                      breakdownAmount: { currencyCode: "INR", currencyAmount: -89.68 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      "408-0945216-1484303",
    );

    expect(event.components).toEqual([
      expect.objectContaining({
        amountRole: "principal",
        code: "ProductCharges",
        amount: "1566.95",
      }),
      expect.objectContaining({
        amountRole: "marketplace_fee",
        code: "Commission",
        amount: "-349.09",
      }),
      expect.objectContaining({
        amountRole: "marketplace_fee",
        code: "FixedClosingFee",
        amount: "-89.68",
      }),
    ]);
  });

  it("keeps the final released transaction when Amazon returns deferred lifecycle duplicates", () => {
    const events = normalizeAmazonFinanceTransactions(
      [
        {
          transactionId: "deferred-shipment",
          transactionType: "Shipment",
          transactionStatus: "DEFERRED_RELEASED",
          description: "Order Payment",
          postedDate: "2026-04-27T08:29:18Z",
          totalAmount: { currencyCode: "INR", currencyAmount: 1400.83 },
          relatedIdentifiers: [
            { relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "408-0945216-1484303" },
            { relatedIdentifierName: "SHIPMENT_ID", relatedIdentifierValue: "shipment-1" },
          ],
          items: [
            {
              relatedIdentifiers: [
                {
                  itemRelatedIdentifierName: "ORDER_ADJUSTMENT_ITEM_ID",
                  itemRelatedIdentifierValue: "item-1",
                },
              ],
              breakdowns: [
                {
                  breakdownType: "ProductCharges",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: 1566.95 },
                },
              ],
            },
          ],
        },
        {
          transactionId: "released-shipment",
          transactionType: "Shipment",
          transactionStatus: "RELEASED",
          description: "Order Payment",
          postedDate: "2026-05-13T08:59:08Z",
          totalAmount: { currencyCode: "INR", currencyAmount: 1400.83 },
          relatedIdentifiers: [
            { relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "408-0945216-1484303" },
            { relatedIdentifierName: "SHIPMENT_ID", relatedIdentifierValue: "shipment-1" },
          ],
          items: [
            {
              relatedIdentifiers: [
                {
                  itemRelatedIdentifierName: "ORDER_ADJUSTMENT_ITEM_ID",
                  itemRelatedIdentifierValue: "item-1",
                },
              ],
              breakdowns: [
                {
                  breakdownType: "ProductCharges",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: 1566.95 },
                },
              ],
            },
          ],
        },
      ],
      "408-0945216-1484303",
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      dedupeKey: "released-shipment",
      eventStatus: "RELEASED",
    });
    expect(events[0]?.components).toEqual([
      expect.objectContaining({ amountRole: "principal", amount: "1566.95" }),
    ]);
  });

  it("does not double count refund rollups when item refund details exist", () => {
    const [event] = normalizeAmazonFinanceTransactions(
      [
        {
          transactionId: "refund-1",
          transactionType: "Refund",
          transactionStatus: "RELEASED",
          totalAmount: { currencyCode: "INR", currencyAmount: -1402.4 },
          breakdowns: [
            {
              breakdownType: "Refunded Sales",
              breakdownAmount: { currencyCode: "INR", currencyAmount: -1849 },
              breakdowns: [
                {
                  breakdownType: "ProductCharges",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: -1566.95 },
                },
                {
                  breakdownType: "Tax",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: -282.05 },
                },
              ],
            },
            {
              breakdownType: "Refunded Expenses",
              breakdownAmount: { currencyCode: "INR", currencyAmount: 446.6 },
              breakdowns: [
                {
                  breakdownType: "AmazonFees",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: 438.77 },
                },
              ],
            },
          ],
          items: [
            {
              breakdowns: [
                {
                  breakdownType: "ProductCharges",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: -1566.95 },
                },
                {
                  breakdownType: "Tax",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: -282.05 },
                },
                {
                  breakdownType: "AmazonFees",
                  breakdownAmount: { currencyCode: "INR", currencyAmount: 438.77 },
                },
              ],
            },
          ],
        },
      ],
      "408-0945216-1484303",
    );

    expect(event.components).toEqual([
      expect.objectContaining({ amountRole: "refund", code: "ProductCharges", amount: "-1566.95" }),
      expect.objectContaining({ amountRole: "refund", code: "Tax", amount: "-282.05" }),
      expect.objectContaining({ amountRole: "marketplace_fee", code: "AmazonFees", amount: "438.77" }),
    ]);
  });
});
