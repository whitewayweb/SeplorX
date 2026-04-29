import { beforeEach, describe, expect, it, vi } from "vitest";

function createChainMock(resolvedValue: unknown = []) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "where",
    "limit",
    "set",
    "values",
    "returning",
    "orderBy",
    "onConflictDoNothing",
  ];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolvedValue).then(resolve);
  return chain;
}

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("@/lib/channels/handlers", () => ({
  getChannelHandler: vi.fn(),
}));

vi.mock("@/lib/channels/utils", () => ({
  decryptChannelCredentials: vi.fn(),
}));

vi.mock("@/lib/channels/queries", () => ({
  upsertChannelProducts: vi.fn(),
}));

const amazonClientMock = {
  createListingsReport: vi.fn(),
  getListingsReportStatus: vi.fn(),
  downloadAndParseListingsReport: vi.fn(),
  enrichProducts: vi.fn(),
};

vi.mock("@/lib/channels/amazon/api/client", () => ({
  AmazonAPIClient: vi.fn(function AmazonAPIClientMock() {
    return amazonClientMock;
  }),
}));

import { db } from "@/db";
import { getChannelHandler } from "@/lib/channels/handlers";
import { decryptChannelCredentials } from "@/lib/channels/utils";
import { upsertChannelProducts } from "@/lib/channels/queries";
import {
  processChannelProductSyncJobService,
  startChannelProductSyncJobService,
} from "../product-sync";

function mockSelectSequence(results: unknown[][]) {
  let index = 0;
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
    const rows = results[index] ?? [];
    index++;
    return createChainMock(rows);
  });
}

function mockUpdate() {
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue(createChainMock());
}

describe("channel product sync jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getChannelHandler as ReturnType<typeof vi.fn>).mockReturnValue({
      capabilities: { canFetchProducts: true },
      fetchProducts: vi.fn(),
    });
    (decryptChannelCredentials as ReturnType<typeof vi.fn>).mockResolvedValue({
      marketplaceId: "A21TJRUUN4KGV",
      clientId: "client",
      clientSecret: "secret",
      refreshToken: "refresh",
    });
  });

  it("throws when the channel is not owned by the user", async () => {
    mockSelectSequence([
      [], // active job lookup
      [], // channel lookup
    ]);

    await expect(startChannelProductSyncJobService(99, 1)).rejects.toThrow("Channel not found");
  });

  it("returns an existing active job instead of starting a duplicate", async () => {
    const job = {
      id: 7,
      channelId: 1,
      status: "waiting_report",
      phase: "waiting_report",
      reportId: "R1",
      reportDocumentId: null,
      totalCount: 0,
      importedCount: 0,
      enrichedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      errorMessage: null,
      createdAt: new Date("2026-04-29T00:00:00Z"),
      updatedAt: new Date("2026-04-29T00:00:00Z"),
      completedAt: null,
    };

    mockSelectSequence([
      [{ id: 7 }], // active job lookup
      [job], // job status lookup
      [], // recent items
    ]);

    const result = await startChannelProductSyncJobService(1, 1);

    expect(result.id).toBe(7);
    expect(amazonClientMock.createListingsReport).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("starts an Amazon report job without blocking for report completion", async () => {
    amazonClientMock.createListingsReport.mockResolvedValue("REPORT-1");
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(createChainMock([{ id: 3 }]));
    mockSelectSequence([
      [], // active job lookup
      [{
        id: 1,
        userId: 1,
        channelType: "amazon",
        storeUrl: "https://sellingpartnerapi-eu.amazon.com",
        credentials: {},
        status: "connected",
      }],
      [{
        id: 3,
        channelId: 1,
        status: "waiting_report",
        phase: "waiting_report",
        reportId: "REPORT-1",
        reportDocumentId: null,
        totalCount: 0,
        importedCount: 0,
        enrichedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        errorMessage: null,
        createdAt: new Date("2026-04-29T00:00:00Z"),
        updatedAt: new Date("2026-04-29T00:00:00Z"),
        completedAt: null,
      }],
      [],
    ]);

    const result = await startChannelProductSyncJobService(1, 1);

    expect(result.status).toBe("waiting_report");
    expect(amazonClientMock.createListingsReport).toHaveBeenCalledOnce();
    expect(amazonClientMock.getListingsReportStatus).not.toHaveBeenCalled();
  });

  it("polls a pending Amazon report once and leaves the job waiting", async () => {
    amazonClientMock.getListingsReportStatus.mockResolvedValue({ processingStatus: "IN_PROGRESS" });
    mockUpdate();
    mockSelectSequence([
      [{
        id: 3,
        channelId: 1,
        status: "waiting_report",
        phase: "waiting_report",
        reportId: "REPORT-1",
        reportDocumentId: null,
      }],
      [{
        id: 1,
        userId: 1,
        channelType: "amazon",
        storeUrl: "https://sellingpartnerapi-eu.amazon.com",
        credentials: {},
        status: "connected",
      }],
      [{
        id: 3,
        channelId: 1,
        status: "waiting_report",
        phase: "waiting_report",
        reportId: "REPORT-1",
        reportDocumentId: null,
        totalCount: 0,
        importedCount: 0,
        enrichedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        errorMessage: null,
        createdAt: new Date("2026-04-29T00:00:00Z"),
        updatedAt: new Date("2026-04-29T00:00:00Z"),
        completedAt: null,
      }],
      [],
    ]);

    const result = await processChannelProductSyncJobService(1, 3);

    expect(result.status).toBe("waiting_report");
    expect(amazonClientMock.getListingsReportStatus).toHaveBeenCalledOnce();
    expect(amazonClientMock.downloadAndParseListingsReport).not.toHaveBeenCalled();
  });

  it("imports a completed Amazon report and records product sync items", async () => {
    const reportProducts = [
      { id: "B001", name: "New Amazon Product", sku: "SKU-1", stockQuantity: 4, rawPayload: { "seller-sku": "SKU-1" } },
    ];
    amazonClientMock.getListingsReportStatus.mockResolvedValue({
      processingStatus: "DONE",
      reportDocumentId: "DOC-1",
    });
    amazonClientMock.downloadAndParseListingsReport.mockResolvedValue(reportProducts);
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(createChainMock());
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(createChainMock());
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    mockSelectSequence([
      [{
        id: 3,
        channelId: 1,
        status: "waiting_report",
        phase: "waiting_report",
        reportId: "REPORT-1",
        reportDocumentId: null,
      }],
      [{
        id: 1,
        userId: 1,
        channelType: "amazon",
        storeUrl: "https://sellingpartnerapi-eu.amazon.com",
        credentials: {},
        status: "connected",
      }],
      [{ id: 11, externalId: "B001", sku: "SKU-1" }],
      [{ totalCount: 1, enrichedCount: 0, failedCount: 0, skippedCount: 0, pendingCount: 0 }],
      [{
        id: 3,
        channelId: 1,
        status: "done",
        phase: "done",
        reportId: "REPORT-1",
        reportDocumentId: "DOC-1",
        totalCount: 1,
        importedCount: 1,
        enrichedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        errorMessage: null,
        createdAt: new Date("2026-04-29T00:00:00Z"),
        updatedAt: new Date("2026-04-29T00:00:00Z"),
        completedAt: new Date("2026-04-29T00:00:00Z"),
      }],
      [],
    ]);

    const result = await processChannelProductSyncJobService(1, 3);

    expect(result.status).toBe("done");
    expect(amazonClientMock.downloadAndParseListingsReport).toHaveBeenCalledWith("DOC-1");
    expect(upsertChannelProducts).toHaveBeenCalledWith([
      expect.objectContaining({
        channelId: 1,
        externalId: "B001",
        name: "New Amazon Product",
        sku: "SKU-1",
      }),
    ]);
    expect(db.insert).toHaveBeenCalled();
  });
});
