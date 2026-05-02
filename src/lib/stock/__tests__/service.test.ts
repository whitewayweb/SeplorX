import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB with proper Drizzle chain resolution ─────────────────────────────

// Drizzle queries are thenable — the chain itself resolves when awaited.
// We need mocks that support both chaining AND promise resolution.

function createChainMock(resolvedValue: unknown = []) {
  const chain: Record<string, unknown> = {};
  // Include all Drizzle chain methods used by the service (keep in sync when service evolves)
  const methods = ["from", "where", "limit", "set", "values", "returning", "innerJoin", "orderBy", "onConflictDoUpdate", "onConflictDoNothing"];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  // Make the chain itself thenable (like Drizzle queries)
  chain.then = (resolve: (val: unknown) => unknown) => Promise.resolve(resolvedValue).then(resolve);
  return chain;
}

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  products: { id: "p.id", quantityOnHand: "p.qty", reservedQuantity: "p.reserved", updatedAt: "p.updated" },
  salesOrders: { id: "so.id", stockProcessed: "so.stock_processed", returnDisposition: "so.return_disposition" },
  salesOrderItems: {
    id: "soi.id", orderId: "soi.order_id", productId: "soi.product_id",
    quantity: "soi.quantity", returnQuantity: "soi.return_quantity", returnDisposition: "soi.return_disposition",
  },
  inventoryTransactions: { id: "it.id" },
  stockReservations: {
    id: "sr.id", orderId: "sr.order_id", orderItemId: "sr.order_item_id",
    productId: "sr.product_id", quantity: "sr.quantity", status: "sr.status",
  },
  // Required by triggerChannelSync() which is called after every stock mutation
  channelProductMappings: { productId: "cpm.product_id", syncStatus: "cpm.sync_status" },
}));

import { db } from "@/db";
import { processOrderStockChange, processReturnItem } from "../service";

// ─── Helper to set up the standard mock pattern ──────────────────────────────

function mockDbSelect(returnValue: unknown) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue(createChainMock(returnValue));
}

function createTxMock() {
  // Each call to tx.select/insert/update needs to return a fresh chain
  // We track call counts to return different values for subsequent calls
  const selectResults: unknown[][] = [];
  let selectCallIndex = 0;

  return {
    select: vi.fn().mockImplementation(() => {
      const result = selectResults[selectCallIndex] ?? [];
      selectCallIndex++;
      return createChainMock(result);
    }),
    insert: vi.fn().mockReturnValue(createChainMock()),
    update: vi.fn().mockReturnValue(createChainMock()),
    _pushSelectResult(result: unknown[]) {
      selectResults.push(result);
    },
  };
}

describe("Stock Service — processOrderStockChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Test 1: New pending order with mapped products → reservation created ──
  it("should create reservations for a new pending order with mapped products", async () => {
    const orderItems = [
      { id: 1, productId: 10, quantity: 5 },
      { id: 2, productId: 20, quantity: 3 },
    ];

    mockDbSelect(orderItems);

    let txInsertCount = 0;
    let txUpdateCount = 0;

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      // First select per item: isBundle check, then reservation idempotency check
      tx._pushSelectResult([{ isBundle: false }]); // item 1: isBundle
      tx._pushSelectResult([]); // item 1: no existing reservation
      tx._pushSelectResult([{ isBundle: false }]); // item 2: isBundle
      tx._pushSelectResult([]); // item 2: no existing reservation

      tx.insert = vi.fn().mockReturnValue(createChainMock());
      tx.update = vi.fn().mockReturnValue(createChainMock());

      const origInsert = tx.insert;
      const origUpdate = tx.update;
      tx.insert = vi.fn().mockImplementation((...args) => { txInsertCount++; return origInsert(...args); });
      tx.update = vi.fn().mockImplementation((...args) => { txUpdateCount++; return origUpdate(...args); });

      await cb(tx);
    });

    await processOrderStockChange(1, "pending", null, 100);

    expect(db.transaction).toHaveBeenCalledOnce();
    // 2 items × (1 insert reservation + 1 insert txn log) + 0 extra = 4 inserts
    expect(txInsertCount).toBe(4);
    // 2 items × (1 product + 1 channel mapping) + 1 stockProcessed = 5 updates
    expect(txUpdateCount).toBe(5);
  });

  // ─── Test 2: Unmapped products → no stock change ──────────────────────────
  it("should not create reservations for unmapped items (null productId)", async () => {
    const orderItems = [{ id: 1, productId: null, quantity: 5 }];
    mockDbSelect(orderItems);

    let txInsertCount = 0;

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx.insert = vi.fn().mockImplementation(() => { txInsertCount++; return createChainMock(); });
      tx.update = vi.fn().mockReturnValue(createChainMock());
      await cb(tx);
    });

    await processOrderStockChange(1, "pending", null, 100);
    // No reservation inserts - only the stockProcessed update insert would happen
    // Actually 0 inserts since null productId is skipped
    expect(txInsertCount).toBe(0);
  });

  // ─── Test 3: pending → processing → no stock change (reserved → reserved) ──
  it("should be a no-op for reserved → reserved transitions", async () => {
    await processOrderStockChange(1, "processing", "pending", 100);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  // ─── Test 4: processing → shipped → no stock change ───────────────────────
  it("should be a no-op for processing → shipped", async () => {
    await processOrderStockChange(1, "shipped", "processing", 100);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  // ─── Test 5: shipped → delivered → commit stock ────────────────────────────
  it("should commit stock when order transitions to delivered", async () => {
    let txUpdateCount = 0;
    let txInsertCount = 0;

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      // Select returns active reservations
      tx._pushSelectResult([
        { id: 1, productId: 10, quantity: 5, orderItemId: 1 },
      ]);

      tx.update = vi.fn().mockImplementation(() => { txUpdateCount++; return createChainMock(); });
      tx.insert = vi.fn().mockImplementation(() => { txInsertCount++; return createChainMock(); });
      await cb(tx);
    });

    await processOrderStockChange(1, "delivered", "shipped", 100);
    expect(db.transaction).toHaveBeenCalledOnce();
    // 1 update product + 1 update reservation status + 1 channel mapping = 3 updates
    expect(txUpdateCount).toBe(3);
    // 1 insert inventory transaction
    expect(txInsertCount).toBe(1);
  });

  // ─── Test 6: pending → cancelled → release reservation ────────────────────
  it("should release reservation when order is cancelled", async () => {
    let txUpdateCount = 0;
    let txInsertCount = 0;

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx._pushSelectResult([{ id: 1, productId: 10, quantity: 5 }]);
      tx.update = vi.fn().mockImplementation(() => { txUpdateCount++; return createChainMock(); });
      tx.insert = vi.fn().mockImplementation(() => { txInsertCount++; return createChainMock(); });
      await cb(tx);
    });

    await processOrderStockChange(1, "cancelled", "pending", 100);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(txUpdateCount).toBe(3); // product + reservation + channel mapping
    expect(txInsertCount).toBe(1); // inventory transaction
  });

  // ─── Test 7: processing → refunded → same as cancelled ────────────────────
  it("should release reservation when order is refunded", async () => {
    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx._pushSelectResult([{ id: 1, productId: 10, quantity: 3 }]);
      tx.update = vi.fn().mockReturnValue(createChainMock());
      tx.insert = vi.fn().mockReturnValue(createChainMock());
      await cb(tx);
    });

    await processOrderStockChange(1, "refunded", "processing", 100);
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  // ─── Test 8: delivered → returned → mark for inspection ────────────────────
  it("should mark order as pending inspection when returned", async () => {
    let txUpdateCount = 0;

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx._pushSelectResult([{ id: 1 }, { id: 2 }]); // 2 order items
      tx.update = vi.fn().mockImplementation(() => { txUpdateCount++; return createChainMock(); });
      await cb(tx);
    });

    await processOrderStockChange(1, "returned", "delivered", 100);
    expect(db.transaction).toHaveBeenCalledOnce();
    // 1 update salesOrders + 2 updates salesOrderItems = 3
    expect(txUpdateCount).toBe(3);
  });

  // ─── Test 13: Same status → no-op ─────────────────────────────────────────
  it("should be a no-op when status is unchanged", async () => {
    await processOrderStockChange(1, "processing", "processing", 100);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  // ─── Test 14: Zero quantity items → skipped ────────────────────────────────
  it("should skip items with zero quantity", async () => {
    mockDbSelect([{ id: 1, productId: 10, quantity: 0 }]);

    let txInsertCount = 0;

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx.insert = vi.fn().mockImplementation(() => { txInsertCount++; return createChainMock(); });
      tx.update = vi.fn().mockReturnValue(createChainMock());
      await cb(tx);
    });

    await processOrderStockChange(1, "pending", null, 100);
    // No reservation inserts (qty 0 is skipped)
    expect(txInsertCount).toBe(0);
  });

  // ─── Test 15: Null productId → handled gracefully ─────────────────────────
  it("should handle null productId without errors", async () => {
    mockDbSelect([{ id: 1, productId: null, quantity: 5 }]);

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx.insert = vi.fn().mockReturnValue(createChainMock());
      tx.update = vi.fn().mockReturnValue(createChainMock());
      await cb(tx);
    });

    await expect(processOrderStockChange(1, "pending", null, 100)).resolves.not.toThrow();
  });

  // ─── Test: New cancelled order → no stock action ──────────────────────────
  it("should not change stock for a new order arriving as cancelled", async () => {
    await processOrderStockChange(1, "cancelled", null, 100);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  // ─── Test: New failed order → no stock action ─────────────────────────────
  it("should not change stock for a new order arriving as failed", async () => {
    await processOrderStockChange(1, "failed", null, 100);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  // ─── Test: New delivered order → commit directly ──────────────────────────
  it("should commit stock directly for a new delivered order", async () => {
    mockDbSelect([{ id: 1, productId: 10, quantity: 2 }]);

    let txUpdateCount = 0;
    let txInsertCount = 0;

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx.update = vi.fn().mockImplementation(() => { txUpdateCount++; return createChainMock(); });
      tx.insert = vi.fn().mockImplementation(() => { txInsertCount++; return createChainMock([{ id: 1 }]); });
      await cb(tx);
    });

    await processOrderStockChange(1, "delivered", null, 100);
    expect(db.transaction).toHaveBeenCalledOnce();
    // 1 update product + 1 update stockProcessed + 1 channel mapping = 3
    expect(txUpdateCount).toBe(3);
    // 1 insert reservation + 1 insert txn = 2
    expect(txInsertCount).toBe(2);
  });

  // ─── Test: Idempotency — existing reservation → skip ──────────────────────
  it("should skip creating reservation if one already exists", async () => {
    mockDbSelect([{ id: 1, productId: 10, quantity: 5 }]);

    let txInsertCount = 0;

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx._pushSelectResult([{ isBundle: false }]); // isBundle check
      tx._pushSelectResult([{ quantity: 5 }]); // Existing reservation found with same quantity
      tx.insert = vi.fn().mockImplementation(() => { txInsertCount++; return createChainMock(); });
      tx.update = vi.fn().mockReturnValue(createChainMock());
      await cb(tx);
    });

    await processOrderStockChange(1, "pending", null, 100);
    // 1 insert for the upsert, 0 for inventory transaction (delta = 0)
    expect(txInsertCount).toBe(1);
  });

  // ─── Test: Empty order items → no transaction ─────────────────────────────
  it("should not create transaction for orders with no items", async () => {
    mockDbSelect([]);
    await processOrderStockChange(1, "pending", null, 100);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  // ─── Test: Multiple items, mixed mapped/unmapped ──────────────────────────
  it("should only create reservations for mapped items in mixed order", async () => {
    mockDbSelect([
      { id: 1, productId: 10, quantity: 5 },  // mapped
      { id: 2, productId: null, quantity: 3 }, // unmapped
      { id: 3, productId: 20, quantity: 2 },   // mapped
    ]);

    let txInsertCount = 0;

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx._pushSelectResult([{ isBundle: false }]); // item 1: isBundle
      tx._pushSelectResult([]); // item 1: no existing reservation
      tx._pushSelectResult([{ isBundle: false }]); // item 3: isBundle
      tx._pushSelectResult([]); // item 3: no existing reservation (item 2 skipped)
      tx.insert = vi.fn().mockImplementation(() => { txInsertCount++; return createChainMock(); });
      tx.update = vi.fn().mockReturnValue(createChainMock());
      await cb(tx);
    });

    await processOrderStockChange(1, "pending", null, 100);
    // 2 mapped items × 2 inserts (reservation + txn) = 4
    expect(txInsertCount).toBe(4);
  });
});

describe("Stock Service — processReturnItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Test 9: Return → restock (full qty) ──────────────────────────────────
  it("should restock full quantity on return", async () => {
    let txUpdateCount = 0;
    let txInsertCount = 0;

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx._pushSelectResult([{
        id: 1, orderId: 100, productId: 10, orderQty: 5, returnQuantity: 0,
      }]);
      tx._pushSelectResult([{ isBundle: false }]); // isBundle check
      tx._pushSelectResult([]); // No more pending items after this one

      tx.update = vi.fn().mockImplementation(() => { txUpdateCount++; return createChainMock(); });
      tx.insert = vi.fn().mockImplementation(() => { txInsertCount++; return createChainMock(); });
      await cb(tx);
    });

    await processReturnItem(1, "restock", 5, 100, "Good condition");
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(txInsertCount).toBeGreaterThanOrEqual(1); // At least 1 inventory txn
    expect(txUpdateCount).toBeGreaterThanOrEqual(1); // At least 1 product update
  });

  // ─── Test 10: Return → discard (full qty) ─────────────────────────────────
  it("should log discard without changing product stock", async () => {
    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx._pushSelectResult([{
        id: 1, orderId: 100, productId: 10, orderQty: 5, returnQuantity: 0,
      }]);
      tx._pushSelectResult([{ isBundle: false }]); // isBundle check
      tx._pushSelectResult([]);
      tx.update = vi.fn().mockReturnValue(createChainMock());
      tx.insert = vi.fn().mockReturnValue(createChainMock());
      await cb(tx);
    });

    await processReturnItem(1, "discard", 5, 100, "Damaged");
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  // ─── Test 11: Partial restock (3 of 5) ────────────────────────────────────
  it("should handle partial return restock", async () => {
    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx._pushSelectResult([{
        id: 1, orderId: 100, productId: 10, orderQty: 5, returnQuantity: 0,
      }]);
      tx._pushSelectResult([{ isBundle: false }]); // isBundle check
      tx._pushSelectResult([{ id: 1 }]); // Still pending items (partial)
      tx.update = vi.fn().mockReturnValue(createChainMock());
      tx.insert = vi.fn().mockReturnValue(createChainMock());
      await cb(tx);
    });

    // Should not throw — partial return of 3 out of 5
    await expect(processReturnItem(1, "restock", 3, 100)).resolves.not.toThrow();
  });

  // ─── Test: Exceeding returnable quantity → error ──────────────────────────
  it("should throw when return qty exceeds available", async () => {
    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx._pushSelectResult([{
        id: 1, orderId: 100, productId: 10, orderQty: 5, returnQuantity: 3,
      }]);
      await cb(tx);
    });

    // Only 2 returnable (5 - 3), trying to return 5
    await expect(processReturnItem(1, "restock", 5, 100)).rejects.toThrow("Cannot return 5");
  });

  // ─── Test: Order item not found → error ───────────────────────────────────
  it("should throw when order item not found", async () => {
    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx._pushSelectResult([]); // No item found
      await cb(tx);
    });

    await expect(processReturnItem(999, "restock", 1, 100)).rejects.toThrow("Order item not found");
  });

  // ─── Test: No product linked → error ──────────────────────────────────────
  it("should throw when no product linked", async () => {
    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (cb) => {
      const tx = createTxMock();
      tx._pushSelectResult([{
        id: 1, orderId: 100, productId: null, orderQty: 5, returnQuantity: 0,
      }]);
      await cb(tx);
    });

    await expect(processReturnItem(1, "restock", 1, 100)).rejects.toThrow("No product linked");
  });
});
