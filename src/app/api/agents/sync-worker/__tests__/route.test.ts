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

  it("fetches orders for channel sync", async () => {
    const calls: string[] = [];
    const fetchAndSaveOrders = vi.fn(async () => {
      calls.push("orders");
      return { fetched: 1, saved: 0 };
    });
    mocks.markOrderSyncSucceeded.mockImplementation(async () => {
      calls.push("mark");
    });

    mocks.getChannelHandler.mockReturnValue({
      fetchAndSaveOrders,
    });

    const response = await POST(createSyncRequest());
    expect(response.status).toBe(202);

    await mocks.afterCallbacks[0]();

    expect(calls).toEqual(["orders", "mark"]);
    expect(fetchAndSaveOrders).toHaveBeenCalledWith(1, 12);
    expect(mocks.markOrderSyncSucceeded).toHaveBeenCalledWith(12);
    expect(mocks.releaseOrderSyncClaim).not.toHaveBeenCalled();
  });

  it("skips finance-only requests because auto-finance sync is disabled", async () => {
    const response = await POST(createSyncRequest({ channelId: 12, financeOnly: true }));
    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data.skipped).toBe(true);
    expect(mocks.afterCallbacks).toHaveLength(0);
  });
});
