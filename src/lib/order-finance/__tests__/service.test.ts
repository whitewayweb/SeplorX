import { describe, expect, it } from "vitest";

import { PROFIT_ADJUSTMENT_ROLES } from "../service";

describe("order finance profit roles", () => {
  it("only includes cost-side finance roles in dashboard profit adjustments", () => {
    expect(PROFIT_ADJUSTMENT_ROLES).toEqual([
      "marketplace_fee",
      "payment_fee",
      "withholding",
      "adjustment",
      "other",
    ]);
    expect(PROFIT_ADJUSTMENT_ROLES).not.toContain("principal");
    expect(PROFIT_ADJUSTMENT_ROLES).not.toContain("tax");
    expect(PROFIT_ADJUSTMENT_ROLES).not.toContain("shipping_revenue");
    expect(PROFIT_ADJUSTMENT_ROLES).not.toContain("discount");
    expect(PROFIT_ADJUSTMENT_ROLES).not.toContain("order_fee_revenue");
    expect(PROFIT_ADJUSTMENT_ROLES).not.toContain("refund");
  });
});
