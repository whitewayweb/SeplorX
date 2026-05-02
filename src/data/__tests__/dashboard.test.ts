import { describe, expect, it } from "vitest";
import { parseDashboardRange } from "@/data/dashboard";

describe("parseDashboardRange", () => {
  it("defaults to 7 days when the value is missing", () => {
    expect(parseDashboardRange(undefined)).toBe(7);
  });

  it("uses the first value when the query value is an array", () => {
    expect(parseDashboardRange(["30", "90"])).toBe(30);
  });

  it("defaults to 7 days for invalid numbers", () => {
    expect(parseDashboardRange("abc")).toBe(7);
  });

  it("defaults to 7 days for unsupported numbers", () => {
    expect(parseDashboardRange("60")).toBe(7);
  });

  it.each([
    ["7", 7],
    ["14", 14],
    ["30", 30],
    ["90", 90],
  ] as const)("supports %s days", (value, expected) => {
    expect(parseDashboardRange(value)).toBe(expected);
  });
});
