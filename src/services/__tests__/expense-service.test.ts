import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveExpenseOcrTask, convertExpenseToOrderLine } from "../expense.service";
import { db } from "@/db";

// Mock the DB and Drizzle
vi.mock("@/db", () => {
  return {
    db: {
      transaction: vi.fn(),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
    },
  };
});

describe("Expense Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveExpenseOcrTask", () => {
    it("should resolve the task and insert an expense", async () => {
      // Mock transaction implementation
      vi.mocked(db.transaction).mockImplementation(async (cb: unknown) => {
        const mockTx = {
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ id: 1 }]), // agentAction update
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
        };
        return (cb as (tx: unknown) => unknown)(mockTx);
      });

      const data = {
        amount: 100,
        taxAmount: 10,
        currency: "USD",
        date: "2023-10-01",
        name: "Uber",
        paymentMode: "bank_transfer" as const,
        isBillable: false,
      };

      const result = await resolveExpenseOcrTask(1, 99, data);
      expect(result).toBeDefined();
    });

    it("should throw validation error if amount is negative", async () => {
      const data = {
        amount: -100,
        taxAmount: 10,
        currency: "USD",
        date: "2023-10-01",
        name: "Uber",
        paymentMode: "bank_transfer" as const,
        isBillable: false,
      };

      await expect(resolveExpenseOcrTask(1, 99, data)).rejects.toThrow("too_small");
    });
  });

  describe("convertExpenseToOrderLine", () => {
    it("should convert a billable expense to an order line item", async () => {
      // Mock the transaction chain
      const mockExpense = {
        id: 1,
        isBillable: true,
        salesOrderId: 101,
        isInvoiced: false,
        amount: "50.00",
        name: "Freight Charge",
      };

      const mockOrder = {
        id: 101,
        totalAmount: "100.00",
      };

      let selectCallCount = 0;
      vi.mocked(db.transaction).mockImplementation(async (cb: unknown) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) return [mockExpense]; // First select is expense
            return [mockOrder]; // Second select is order
          }),
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ id: 500 }]),
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
        };
        return (cb as (tx: unknown) => unknown)(mockTx);
      });

      const result = await convertExpenseToOrderLine(1);
      expect(result).toEqual({ id: 500 });
    });

    it("should throw if expense is not billable", async () => {
      vi.mocked(db.transaction).mockImplementation(async (cb: unknown) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([{ id: 1, isBillable: false }]),
        };
        return (cb as (tx: unknown) => unknown)(mockTx);
      });

      await expect(convertExpenseToOrderLine(1)).rejects.toThrow("Expense is not marked as billable");
    });
  });
});
