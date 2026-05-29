import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => Promise<void>>,
  headers: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("next/server", () => ({
  after: vi.fn((callback: () => Promise<void>) => {
    mocks.afterCallbacks.push(callback);
  }),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.dbSelect,
  },
}));

vi.mock("@/lib/channels/registry", () => ({
  channelRegistry: [
    { id: "amazon", capabilities: { canSyncOrderFinances: true } },
    { id: "woocommerce", capabilities: { canSyncOrderFinances: true } },
  ],
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    measure: vi.fn((_message: string, _fields: Record<string, unknown>, operation: () => Promise<unknown>) =>
      operation(),
    ),
  },
}));

import { triggerOnDemandSync } from "../on-demand-sync";

function mockStaleChannelRows(rows: Array<{ id: number }>) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mocks.dbSelect.mockReturnValue(chain);
}

describe("triggerOnDemandSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    mocks.headers.mockResolvedValue(
      new Headers({
        host: "seplorx.example.com",
        "x-forwarded-proto": "https",
      }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
  });

  it("schedules the scheduler fetch with Next after when stale channels exist", async () => {
    mockStaleChannelRows([{ id: 12 }]);

    await triggerOnDemandSync(101);

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(1);

    await mocks.afterCallbacks[0]();

    expect(fetch).toHaveBeenCalledWith("https://seplorx.example.com/api/cron/order-sync?userId=101", {
      method: "GET",
      headers: {
        "x-vercel-cron": "1",
      },
      cache: "no-store",
    });
  });

  it("does not schedule a scheduler fetch when no stale channels exist", async () => {
    mockStaleChannelRows([]);

    await triggerOnDemandSync(102);

    expect(mocks.afterCallbacks).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
