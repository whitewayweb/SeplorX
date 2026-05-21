import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveExpenseOcrTask } from "../expense.service";
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
        const mockTx = [] as unknown[] & Record<string, unknown>;
        Object.assign(mockTx, {
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ id: 1 }]), // agentAction update
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
        });
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
});
