import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

import { db } from "@/db";
import { getFitmentRegistry, ensurePendingFitmentRule } from "../fitment";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createChainMock(returnValue: unknown = []) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "limit", "values", "onConflictDoUpdate"];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(returnValue).then(resolve);
  return chain;
}

describe("Fitment Registry Data Layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getFitmentRegistry", () => {
    it("normalizes make and model to uppercase and trims whitespace", async () => {
      const mockRules = [
        { id: "1", make: " byd ", model: " atto 3 ", position: "Front", series: "A" },
        { id: "2", make: "Toyota", model: "Corolla", position: "Rear", series: "B" },
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
        createChainMock([{ value: mockRules }])
      );

      const rules = await getFitmentRegistry();

      expect(rules).toHaveLength(2);
      expect(rules[0].make).toBe("BYD");
      expect(rules[0].model).toBe("ATTO 3");
      expect(rules[1].make).toBe("TOYOTA");
      expect(rules[1].model).toBe("COROLLA");
    });

    it("returns empty array if no rules are found", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue(createChainMock([]));

      const rules = await getFitmentRegistry();
      expect(rules).toEqual([]);
    });
  });

  describe("ensurePendingFitmentRule", () => {
    it("recognizes duplicates despite casing and spacing differences", async () => {
      const existingRules = [
        { id: "1", make: "BYD", model: "ATTO 3", position: "Front", series: "A" },
      ];
      
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
        createChainMock([{ value: existingRules }])
      );
      
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(createChainMock());

      const newRule = {
        make: "  byd ",
        model: " atto 3",
        position: "Front" as const,
        yearStart: undefined,
        yearEnd: undefined,
      };

      const result = await ensurePendingFitmentRule(newRule);
      
      expect(result.id).toBe("1");
      expect(db.insert).not.toHaveBeenCalled();
    });
  });
});
