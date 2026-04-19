import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module mocks — must be hoisted before any imports ────────────────────────

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("../handlers", () => ({
  getChannelHandler: vi.fn(),
}));

vi.mock("@/lib/channels/registry", () => ({
  getChannelById: vi.fn(),
}));

vi.mock("@/lib/channels/utils", () => ({
  decryptChannelCredentials: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
}));

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://test.example.com",
    ENCRYPTION_KEY: "a".repeat(64),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
  deleteChannelService,
  disconnectChannelService,
  resetChannelStatusService,
  syncChannelProductsService,
  pushChannelProductUpdatesService,
  updateChannelProductService,
  createChannelService,
} from "../services";
import { db } from "@/db";
import { getChannelHandler } from "../handlers";
import { getChannelById } from "@/lib/channels/registry";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a Drizzle-style chainable mock that resolves to `returnValue` */
function createChainMock(returnValue: unknown = []) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "limit", "set", "values", "returning", "onConflictDoNothing", "onConflictDoUpdate"];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(returnValue).then(resolve);
  return chain;
}

/** Set up db.select() to resolve through a chain and return `rows` */
function mockSelect(rows: unknown[]) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue(createChainMock(rows));
}

/** Set up db.update() to resolve cleanly */
function mockUpdate() {
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue(createChainMock());
}

/** Set up db.delete() to resolve cleanly */
function mockDelete() {
  (db.delete as ReturnType<typeof vi.fn>).mockReturnValue(createChainMock());
}

/** Set up db.insert() to resolve with provided rows */
function mockInsert(rows: unknown[] = []) {
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(createChainMock(rows));
}

// ─── deleteChannelService — Ownership Guard ───────────────────────────────────

describe("deleteChannelService — ownership guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 'Channel not found' when no matching channel for userId", async () => {
    mockSelect([]); // Empty result = wrong userId or doesn't exist
    await expect(deleteChannelService(999, 1)).rejects.toThrow("Channel not found");
    expect(db.delete).not.toHaveBeenCalled(); // Must not proceed to delete
  });

  it("calls db.delete when channel is found and owned by user", async () => {
    mockSelect([{ id: 1 }]); // Ownership check passes
    mockDelete();
    await expect(deleteChannelService(1, 1)).resolves.not.toThrow();
    expect(db.delete).toHaveBeenCalledOnce();
  });
});

// ─── disconnectChannelService — Ownership Guard ───────────────────────────────

describe("disconnectChannelService — ownership guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 'Channel not found' when userId does not own channel", async () => {
    mockSelect([]);
    await expect(disconnectChannelService(999, 1)).rejects.toThrow("Channel not found");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates status to disconnected when channel found", async () => {
    mockSelect([{ id: 1 }]);
    mockUpdate();
    await expect(disconnectChannelService(1, 1)).resolves.not.toThrow();
    expect(db.update).toHaveBeenCalledOnce();
  });
});

// ─── resetChannelStatusService — Ownership Guard ──────────────────────────────

describe("resetChannelStatusService — ownership guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 'Channel not found' when no row matches", async () => {
    mockSelect([]);
    await expect(resetChannelStatusService(999, 1)).rejects.toThrow("Channel not found");
  });

  it("returns channel row data when found", async () => {
    const channelRow = { id: 1, storeUrl: "https://mystore.com" };
    mockSelect([channelRow]);
    mockUpdate();
    const result = await resetChannelStatusService(1, 1);
    expect(result).toEqual(channelRow);
  });
});

// ─── syncChannelProductsService — State Guards ────────────────────────────────

describe("syncChannelProductsService — state guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 'Channel not found' when userId doesn't match", async () => {
    mockSelect([]);
    await expect(syncChannelProductsService(999, 1)).rejects.toThrow("Channel not found");
  });

  it("throws 'not connected' when channel status is disconnected", async () => {
    mockSelect([{
      id: 1, channelType: "woocommerce", storeUrl: "https://store.com",
      credentials: {}, status: "disconnected",
    }]);
    await expect(syncChannelProductsService(1, 1)).rejects.toThrow("not connected");
  });

  it("throws 'not connected' when channel status is pending", async () => {
    mockSelect([{
      id: 1, channelType: "woocommerce", storeUrl: "https://store.com",
      credentials: {}, status: "pending",
    }]);
    await expect(syncChannelProductsService(1, 1)).rejects.toThrow("not connected");
  });

  it("throws when channel has no storeUrl", async () => {
    mockSelect([{
      id: 1, channelType: "woocommerce", storeUrl: null,
      credentials: {}, status: "connected",
    }]);
    await expect(syncChannelProductsService(1, 1)).rejects.toThrow("no store URL");
  });

  it("throws when handler does not support fetching products", async () => {
    mockSelect([{
      id: 1, channelType: "custom", storeUrl: "https://store.com",
      credentials: { key: "enc:val" }, status: "connected",
    }]);
    (getChannelHandler as ReturnType<typeof vi.fn>).mockReturnValue({
      capabilities: { canFetchProducts: false },
      fetchProducts: undefined,
    });
    await expect(syncChannelProductsService(1, 1)).rejects.toThrow("does not support fetching products");
  });
});

// ─── pushChannelProductUpdatesService — Guard ─────────────────────────────────

describe("pushChannelProductUpdatesService — guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 'Channel not found' when no matching channel", async () => {
    mockSelect([]);
    await expect(pushChannelProductUpdatesService(1, 99)).rejects.toThrow("Channel not found");
  });

  it("throws 'not connected' when channel status is disconnected", async () => {
    mockSelect([{ id: 99, channelType: "woocommerce", status: "disconnected" }]);
    await expect(pushChannelProductUpdatesService(1, 99)).rejects.toThrow("not connected");
  });

  it("throws when no handler is registered for the channel type", async () => {
    mockSelect([{ id: 99, channelType: "custom", status: "connected" }]);
    (getChannelHandler as ReturnType<typeof vi.fn>).mockReturnValue(null);
    await expect(pushChannelProductUpdatesService(1, 99)).rejects.toThrow("No handler registered");
  });

  it("throws when handler does not support push updates", async () => {
    mockSelect([{ id: 99, channelType: "custom", status: "connected" }]);
    (getChannelHandler as ReturnType<typeof vi.fn>).mockReturnValue({
      capabilities: { canPushProductUpdates: false },
      pushPendingUpdates: undefined,
    });
    await expect(pushChannelProductUpdatesService(1, 99)).rejects.toThrow(
      "does not support direct product update sync",
    );
  });
});

// ─── createChannelService — Availability Guard ────────────────────────────────

describe("createChannelService — availability guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when channel type is not available", async () => {
    (getChannelById as ReturnType<typeof vi.fn>).mockReturnValue(null);
    await expect(
      createChannelService(1, { channelType: "unknown", name: "Store" }, {}),
    ).rejects.toThrow("not available");
  });

  it("throws when channel def exists but is not available", async () => {
    (getChannelById as ReturnType<typeof vi.fn>).mockReturnValue({ available: false });
    await expect(
      createChannelService(1, { channelType: "shopify", name: "Store" }, {}),
    ).rejects.toThrow("not available");
  });
});

// ─── updateChannelProductService — Ownership + Mapping Guards ─────────────────

describe("updateChannelProductService — ownership & mapping guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 'Channel not found or unauthorized' when ownership check fails", async () => {
    // First select (ownership check) returns empty
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(createChainMock([]));
    await expect(
      updateChannelProductService(999, 1, 100, "ext-123", { name: "New Name" }),
    ).rejects.toThrow("Channel not found or unauthorized");
  });

  it("throws when product is not mapped to SeplorX inventory", async () => {
    // 1st select: channel found (ownership OK)
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(createChainMock([{ id: 1, channelType: "woocommerce" }]))
      // 2nd select: mapping lookup returns empty
      .mockReturnValueOnce(createChainMock([]));

    await expect(
      updateChannelProductService(1, 1, 100, "ext-123", { name: "New Name" }),
    ).rejects.toThrow("must be mapped");
  });
});
