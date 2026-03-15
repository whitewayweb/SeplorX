import { describe, it, expect, vi, beforeEach } from "vitest";
// We'll need to mock @/db and other modules
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}));

// Mock the handler registry
vi.mock("../handlers", () => ({
  getChannelHandler: vi.fn(),
}));

import { updateChannelProductService } from "../services";
import { db } from "@/db";
import { getChannelHandler } from "../handlers";

describe("Channel Product Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should correctly separate DB columns from raw data and compute delta", async () => {
    // 1. Mock Channel Ownership Check
    const mockChannel = { id: 1, channelType: "woocommerce" };
    const mockMapping = { id: 10 };
    const mockExisting = {
      name: "Old Name",
      sku: "OLD-SKU",
      stockQuantity: 10,
      rawData: { weight: "1.0", regular_price: "100" },
    };

    // Chain mocks for Drizzle
    const selectMock = db.select as any;
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation((val) => {
        // Return different mocks based on current query context
        // This is a bit simplified, a real mock would be more robust
        if (selectMock.mock.calls.length === 1) return [mockChannel];
        if (selectMock.mock.calls.length === 2) return [mockMapping];
        return [mockExisting];
      }),
    });

    const mockHandler = {
      mergeProductUpdate: vi.fn().mockImplementation((old, patch) => {
        const result = { ...old };
        if (patch.itemWeight) result.weight = patch.itemWeight;
        if (patch.price) result.regular_price = patch.price;
        // ... simulate others if needed
        return result;
      }),
    };
    (getChannelHandler as any).mockReturnValue(mockHandler);

    const txMock = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      // Mock changelog staged check
      limit: vi.fn().mockReturnValue([]), 
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
    };
    (db.transaction as any).mockImplementation((cb) => cb(txMock));

    // 2. Run Service
    const patch = {
      name: "New Name",
      itemWeight: "2.5", // Should go to rawData
    };

    await updateChannelProductService(1, 1, 100, "ext-123", patch);

    // 3. Verify
    // Check that update was called with the correct DB columns
    expect(txMock.update).toHaveBeenCalled();
    const setCall = txMock.set.mock.calls[0][0];
    expect(setCall.name).toBe("New Name");
    expect(setCall.rawData).toMatchObject({ weight: "2.5" });

    // Verify delta calculation (name changed, weight changed)
    const insertCall = txMock.insert.mock.calls[0][0]; // This is for changelog insert
    // Wait, let's check the values passed to changelog
    const changelogValues = txMock.values.mock.calls[0][0];
    expect(changelogValues.delta).toMatchObject({
      name: "New Name",
      weight: "2.5",
    });
  });
});
