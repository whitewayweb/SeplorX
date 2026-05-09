import { describe, expect, it, vi } from "vitest";
import {
  backfillSalesOrderItemsForChannelMapping,
  resolveSalesOrderItemCostSnapshot,
} from "@/lib/orders/costs";

function createQueryClient(selectResults: unknown[][]) {
  const updates: unknown[] = [];
  const select = vi.fn(() => createSelectChain(selectResults.shift() ?? []));
  const update = vi.fn(() => ({
    set(values: unknown) {
      updates.push(values);
      return {
        where: vi.fn(async () => undefined),
      };
    },
  }));

  return {
    client: { select, update },
    updates,
  };
}

function createSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async () => result),
    then: Promise.resolve(result).then.bind(Promise.resolve(result)),
  };

  return chain;
}

describe("resolveSalesOrderItemCostSnapshot", () => {
  it("captures simple product purchase price", async () => {
    const { client } = createQueryClient([[{ purchasePrice: "875.00", isBundle: false }]]);

    const snapshot = await resolveSalesOrderItemCostSnapshot(client as never, 28);

    expect(snapshot).toMatchObject({
      unitCost: "875.00",
      costSource: "product_purchase_price",
    });
    expect(snapshot.costCapturedAt).toBeInstanceOf(Date);
  });

  it("derives bundle cost from complete component costs", async () => {
    const { client } = createQueryClient([
      [{ purchasePrice: null, isBundle: true }],
      [{ componentCount: 2, missingComponentCostCount: 0, unitCost: "1500.00" }],
    ]);

    const snapshot = await resolveSalesOrderItemCostSnapshot(client as never, 66);

    expect(snapshot).toMatchObject({
      unitCost: "1500.00",
      costSource: "bundle_component_cost",
    });
  });

  it("leaves cost missing when a bundle component cost is missing", async () => {
    const { client } = createQueryClient([
      [{ purchasePrice: null, isBundle: true }],
      [{ componentCount: 2, missingComponentCostCount: 1, unitCost: "875.00" }],
    ]);

    const snapshot = await resolveSalesOrderItemCostSnapshot(client as never, 66);

    expect(snapshot).toEqual({
      unitCost: null,
      costSource: null,
      costCapturedAt: null,
    });
  });

  it("marks historical reconciliation snapshots as backfills", async () => {
    const { client } = createQueryClient([[{ purchasePrice: "625.00", isBundle: false }]]);

    const snapshot = await resolveSalesOrderItemCostSnapshot(client as never, 29, "current_cost_backfill");

    expect(snapshot).toMatchObject({
      unitCost: "625.00",
      costSource: "current_cost_backfill",
    });
  });
});

describe("backfillSalesOrderItemsForChannelMapping", () => {
  it("updates historical unmapped order items with product and cost snapshot", async () => {
    const { client, updates } = createQueryClient([
      [{ purchasePrice: "875.00", isBundle: false }],
      [{ id: 101 }, { id: 102 }],
    ]);

    const count = await backfillSalesOrderItemsForChannelMapping(
      client as never,
      12,
      "B0TEST",
      28,
    );

    expect(count).toBe(2);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({
      productId: 28,
      unitCost: "875.00",
      costSource: "current_cost_backfill",
    });
  });
});
