import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mocks to isolate Drizzle DB interactions
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@/lib/channels/utils", () => ({
  decryptChannelCredentials: vi.fn().mockReturnValue({
    marketplaceId: "A21TJRUUN4KGV",
    clientId: "mockClient",
    clientSecret: "mockSecret",
    refreshToken: "mockRefresh",
  }),
}));

// We must mock the AmazonAPIClient to avoid real network calls
vi.mock("../api/client", () => {
  return {
    AmazonAPIClient: class {
      async *getOrdersPagedGenerator() {
        yield [
          { AmazonOrderId: "123-1234567-1234567", OrderStatus: "Shipped", BuyerInfo: { BuyerName: "John Doe" } }
        ];
      }
      getOrderBuyerInfo = vi.fn().mockResolvedValue({ BuyerName: "John Doe" });
      getOrderAddress = vi.fn().mockResolvedValue({});
      getOrderItems = vi.fn().mockResolvedValue({
        OrderItems: [
          { OrderItemId: "item1", ASIN: "B001234567", SellerSKU: "MY_SEPLORX_SKU", QuantityOrdered: 1 }
        ]
      });
    }
  };
});

import { db } from "@/db";
import { amazonHandler } from "../index";

describe("Amazon Order Matching Logic", () => {
  let txMock: {
    select: Mock;
    insert: Mock;
  };
  let selectMock: {
    from: Mock;
    innerJoin: Mock;
    where: Mock;
    limit: Mock;
    orderBy: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    selectMock = Object.assign(Promise.resolve([]), {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
    }) as unknown as any;

    txMock = {
      select: vi.fn().mockReturnValue(selectMock),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 999 }]),
        }),
      }) as unknown as Mock,
    };

    (db.transaction as unknown as Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock));
  });

  it("should attempt to match a product via channelProductMappings first, then fallback to local SKU", async () => {
    let dbQueryNum = 0;
    (db.select as unknown as Mock).mockImplementation(() => {
      const mockChain: any = Object.assign(Promise.resolve([]), {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          dbQueryNum++;
          if (dbQueryNum === 1) return [{ storeUrl: "https://amazon.com", credentials: "encrypted", channelType: "amazon" }];
          return [];
        })
      });
      mockChain.from.mockReturnValue(mockChain);
      mockChain.innerJoin.mockReturnValue(mockChain);
      mockChain.where.mockReturnValue(mockChain);
      mockChain.orderBy.mockReturnValue(mockChain);
      return mockChain;
    });

    // 2. Mock queries inside the transaction
    let queryNum = 0;
    selectMock.limit.mockImplementation(() => {
      queryNum++;
      if (queryNum === 1) return []; // Check salesOrder exists
      if (queryNum === 2) return []; // Check channelProductMappings
      if (queryNum === 3) return [{ id: 42 }]; // products fallback

      return [];
    });

    // Run the matching orchestrator
    const result = await amazonHandler.fetchAndSaveOrders!(1, 1);

    expect(result.saved).toBe(1);

    // Verify that the order item was inserted with our fallback productId (42)
    // Call 0 = salesOrders, Call 1 = salesOrderItems
    const orderItemValues = txMock.insert.mock.results[0].value.values.mock.calls[1][0];
    
    expect(orderItemValues).toMatchObject({
      productId: 42,
      sku: "MY_SEPLORX_SKU",
      externalItemId: "item1"
    });
  });

  it("should leave productId as undefined if neither mapping nor local SKU exists", async () => {
    let dbQueryNum = 0;
    (db.select as unknown as Mock).mockImplementation(() => {
      const mockChain: any = Object.assign(Promise.resolve([]), {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          dbQueryNum++;
          if (dbQueryNum === 1) return [{ storeUrl: "https://amazon.com", credentials: "encrypted", channelType: "amazon" }];
          return [];
        })
      });
      mockChain.from.mockReturnValue(mockChain);
      mockChain.innerJoin.mockReturnValue(mockChain);
      mockChain.where.mockReturnValue(mockChain);
      mockChain.orderBy.mockReturnValue(mockChain);
      return mockChain;
    });

    selectMock.limit.mockImplementation(() => []);
    selectMock.where.mockImplementation(() => Object.assign(Promise.resolve([]), selectMock));

    await amazonHandler.fetchAndSaveOrders!(1, 1);

    const orderItemValues = txMock.insert.mock.results[1].value.values.mock.calls[0][0];
    
    expect(orderItemValues.productId).toBeUndefined();
  });
});
