import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => Promise<void>>,
  getChannelHandler: vi.fn(),
  claimOrderSyncChannel: vi.fn(),
  isOrderSyncEnabled: vi.fn(),
  markOrderSyncSucceeded: vi.fn(),
  releaseOrderSyncClaim: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
  after: vi.fn((callback: () => Promise<void>) => {
    mocks.afterCallbacks.push(callback);
  }),
}));

vi.mock("@/lib/channels/handlers", () => ({
  getChannelHandler: mocks.getChannelHandler,
}));

vi.mock("@/lib/agents/order-sync-state", () => ({
  claimOrderSyncChannel: mocks.claimOrderSyncChannel,
  isOrderSyncEnabled: mocks.isOrderSyncEnabled,
  markOrderSyncSucceeded: mocks.markOrderSyncSucceeded,
  releaseOrderSyncClaim: mocks.releaseOrderSyncClaim,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    measure: vi.fn((_message: string, _fields: Record<string, unknown>, operation: () => Promise<unknown>) =>
      operation(),
    ),
  },
}));

import { POST } from "../route";

function createSyncRequest(body: Record<string, unknown> = { channelId: 12 }) {
  return new Request("https://example.com/api/agents/sync-worker", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-cron": "1",
    },
    body: JSON.stringify(body),
  });
}

describe("sync-worker route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    mocks.isOrderSyncEnabled.mockResolvedValue(true);
    mocks.claimOrderSyncChannel.mockResolvedValue({
      id: 12,
      userId: 1,
      channelType: "amazon",
    });
  });

  it("fetches orders before running channel finance sync", async () => {
    const calls: string[] = [];
    const fetchAndSaveOrders = vi.fn(async () => {
      calls.push("orders");
      return { fetched: 1, saved: 0 };
    });
    const syncOrderFinances = vi.fn(async () => {
      calls.push("finance");
      return { checked: 0, synced: 0, noData: 0, failed: 0, notSupported: 0 };
    });
    mocks.markOrderSyncSucceeded.mockImplementation(async () => {
      calls.push("mark");
    });

    mocks.getChannelHandler.mockReturnValue({
      fetchAndSaveOrders,
      syncOrderFinances,
    });

    const response = await POST(createSyncRequest());
    expect(response.status).toBe(202);

    await mocks.afterCallbacks[0]();

    expect(calls).toEqual(["orders", "mark", "finance"]);
    expect(fetchAndSaveOrders).toHaveBeenCalledWith(1, 12);
    expect(syncOrderFinances).toHaveBeenCalledWith(1, 12, {
      limit: 10,
      retryFailed: true,
    });
    expect(mocks.markOrderSyncSucceeded).toHaveBeenCalledWith(12);
    expect(mocks.releaseOrderSyncClaim).not.toHaveBeenCalled();
  });

  it("keeps finance-only requests scoped to finance work", async () => {
    const fetchAndSaveOrders = vi.fn();
    const syncOrderFinances = vi.fn(async () => ({
      checked: 0,
      synced: 0,
      noData: 0,
      failed: 0,
      notSupported: 0,
    }));

    mocks.getChannelHandler.mockReturnValue({
      fetchAndSaveOrders,
      syncOrderFinances,
    });

    await POST(createSyncRequest({ channelId: 12, financeOnly: true }));
    await mocks.afterCallbacks[0]();

    expect(fetchAndSaveOrders).not.toHaveBeenCalled();
    expect(syncOrderFinances).toHaveBeenCalledOnce();
    expect(mocks.markOrderSyncSucceeded).not.toHaveBeenCalled();
    expect(mocks.releaseOrderSyncClaim).toHaveBeenCalledWith(12);
  });
});
