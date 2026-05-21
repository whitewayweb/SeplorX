import { describe, it, expect, vi, beforeEach } from "vitest";
import { runExpenseOcrAgent } from "../expense-ocr-agent";
import { generateObject } from "ai";
import { db } from "@/db";

// Mock AI SDK
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

// Mock Google Provider
vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => "mocked-model"),
}));

// Mock DB
vi.mock("@/db", () => {
  return {
    db: {
      transaction: vi.fn(),
    },
  };
});

describe("Expense OCR Agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse an expense and insert a draft action", async () => {
    const mockExtractedData = {
      vendorName: "Uber",
      amount: 25.50,
      taxAmount: 2.50,
      currency: "USD",
      date: "2024-01-01",
      reference: "UBR-123",
      description: "Ride to airport",
    };

    vi.mocked(generateObject).mockResolvedValue({ object: mockExtractedData } as never);

    vi.mocked(db.transaction).mockImplementation(async (cb: unknown) => {
      const mockTx = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 10 }]),
      };
      return (cb as (tx: unknown) => unknown)(mockTx);
    });

    const buffer = Buffer.from("dummy-file");
    const result = await runExpenseOcrAgent(buffer, "image/jpeg");

    expect(generateObject).toHaveBeenCalled();
    expect(result.taskId).toBe(10);
    expect(result.status).toBe("pending_approval");
  });
});
