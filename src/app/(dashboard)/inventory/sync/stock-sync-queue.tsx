"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpFromLine,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Loader2,
  Search,
  ShieldCheck,
  ShoppingBag,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getChannelById } from "@/lib/channels/registry";
import type { ChannelType } from "@/lib/channels/types";
import { cn } from "@/lib/utils";
import { getStockSyncProductDetails, pollStockPushJob, startStockPushJob } from "./actions";

interface SyncMapping {
  id: number;
  channelId: number;
  channelName: string;
  channelType: string;
  externalProductId: string;
  label: string | null;
  syncStatus: string;
  lastSyncError: string | null;
  channelStock: number | null;
  canPushStock: boolean;
}

interface SyncProduct {
  id: number;
  name: string;
  sku: string | null;
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number;
  mappingCount: number;
  pendingCount: number;
  failedCount: number;
  unknownStockCount: number;
  mismatchCount: number;
  channelStockMin: number | null;
  channelStockMax: number | null;
  channelNames: string[];
  lastTransactionAt: Date | string | null;
  lastTransactionNotes: string | null;
}

interface SyncProductDetail extends SyncProduct {
  mappings: SyncMapping[];
}

interface ChannelGroup {
  key: string;
  name: string;
  type: string;
  listings: SyncMapping[];
  pendingCount: number;
  failedCount: number;
  unknownStockCount: number;
  mismatchCount: number;
  channelStockMin: number | null;
  channelStockMax: number | null;
  canPushStock: boolean;
}

interface StockSyncQueueProps {
  products: SyncProduct[];
  channelOptions: string[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  initialSearchQuery: string;
  initialStatusFilter: string;
  initialChannelFilter: string;
}

type ListingFilter = "all" | "differences" | "pending" | "failed";

interface StockPushJobItem {
  id: number;
  mappingId: number;
  channelId: number;
  channelName: string;
  externalProductId: string;
  label: string | null;
  status: string;
  channelStock: number | null;
  errorMessage: string | null;
  updatedAt: Date | string;
}

interface StockPushJob {
  id: number;
  productId: number;
  quantity: number;
  status: string;
  totalCount: number;
  pushedCount: number;
  failedCount: number;
  skippedCount: number;
  errorMessage: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  completedAt: Date | string | null;
  items: StockPushJobItem[];
}

const STATUS_UI: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "border-muted bg-muted text-muted-foreground",
  },
  processing: {
    label: "Syncing",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  success: {
    label: "Updated",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  skipped: {
    label: "Skipped",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  },
  pending_update: {
    label: "Review",
    className: "border-yellow-200 bg-yellow-50 text-yellow-700",
  },
  failed: {
    label: "Failed",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  file_generating: {
    label: "Generating",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  uploading: {
    label: "Uploading",
    className: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
};

export function StockSyncQueue({
  products,
  channelOptions,
  totalCount,
  currentPage,
  pageSize,
  initialSearchQuery,
  initialStatusFilter,
  initialChannelFilter,
}: StockSyncQueueProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [requestedProductId, setRequestedProductId] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<number, SyncProductDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());
  const [activeJob, setActiveJob] = useState<StockPushJob | null>(null);
  const [isPollingJob, setIsPollingJob] = useState(false);
  const [confirmPushProduct, setConfirmPushProduct] = useState<SyncProduct | null>(null);
  const [listingPanelGroupKey, setListingPanelGroupKey] = useState<string | null>(null);
  const [listingSearchQuery, setListingSearchQuery] = useState("");
  const [listingFilter, setListingFilter] = useState<ListingFilter>("all");
  const [listingPage, setListingPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [channelFilter, setChannelFilter] = useState(initialChannelFilter);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [isPending, startTransition] = useTransition();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredProducts = products;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const activeProductId =
    requestedProductId && filteredProducts.some((product) => product.id === requestedProductId)
      ? requestedProductId
      : null;

  const loadProductDetail = useCallback(async (productId: number, isCancelled: () => boolean) => {
    setDetailLoadingId(productId);
    const result = await getStockSyncProductDetails(productId);
    if (isCancelled()) return;

    setDetailLoadingId(null);

    if ("error" in result) {
      toast.error("Could not load mappings", { description: result.error });
      return;
    }

    if ("success" in result && result.success) {
      const product = normalizeProductDetail(result.product);
      setDetailCache((current) => ({ ...current, [product.id]: product }));
      setExpandedChannels(new Set(product.mappings.map((mapping) => String(mapping.channelId))));
    }
  }, []);

  const closeProductPanel = useCallback(() => {
    setRequestedProductId(null);
    setListingPanelGroupKey(null);
    setConfirmPushProduct(null);
  }, []);

  useEffect(() => {
    if (!activeProductId || detailCache[activeProductId]) return;

    let cancelled = false;
    void Promise.resolve().then(() => loadProductDetail(activeProductId, () => cancelled));

    return () => {
      cancelled = true;
    };
  }, [activeProductId, detailCache, loadProductDetail]);

  const activeSummary = products.find((product) => product.id === activeProductId) ?? null;
  const activeDetail = activeProductId ? detailCache[activeProductId] ?? null : null;
  const displayProduct = activeDetail ?? activeSummary;
  const activeProductJob = displayProduct && activeJob?.productId === displayProduct.id ? activeJob : null;
  const activeJobItemsByMappingId = useMemo(() => {
    return new Map((activeProductJob?.items ?? []).map((item) => [item.mappingId, item]));
  }, [activeProductJob]);
  const isAnyJobRunning = !!activeJob && (activeJob.status === "queued" || activeJob.status === "processing");
  const isActiveJobRunning = !!activeProductJob && (activeProductJob.status === "queued" || activeProductJob.status === "processing");
  const channelGroups = useMemo(
    () => (activeDetail ? getChannelGroups(activeDetail) : []),
    [activeDetail],
  );

  const replaceQueueParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    if (!("page" in updates)) params.delete("page");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  useEffect(() => {
    setChannelFilter(initialChannelFilter);
  }, [initialChannelFilter]);

  useEffect(() => {
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!activeJob || (activeJob.status !== "queued" && activeJob.status !== "processing")) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setIsPollingJob(true);
      try {
        const result = await pollStockPushJob(activeJob.id);
        if (cancelled) return;

        if ("error" in result) {
          toast.error("Could not update push progress", { description: result.error });
          setActiveJob((current) => current ? { ...current, status: "failed", errorMessage: result.error } : current);
          return;
        }

        if ("success" in result && result.success) {
          setActiveJob(result.job);
          if (result.job.status === "done") {
            toast.success("Stock push complete", {
              description: `${result.job.pushedCount} updated, ${result.job.failedCount} failed, ${result.job.skippedCount} skipped.`,
            });
            setDetailCache({});
            router.refresh();
          } else if (result.job.status === "failed" && result.job.pushedCount + result.job.failedCount + result.job.skippedCount >= result.job.totalCount) {
            toast.warning("Stock push finished with failures", {
              description: `${result.job.pushedCount} updated, ${result.job.failedCount} failed, ${result.job.skippedCount} skipped.`,
            });
            setDetailCache({});
            router.refresh();
          }
        }
      } catch {
        if (!cancelled) {
          toast.error("Could not update push progress", { description: "The request did not complete." });
        }
      } finally {
        if (!cancelled) setIsPollingJob(false);
      }
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [activeJob, router]);
  const listingPanelGroup = channelGroups.find((group) => group.key === listingPanelGroupKey) ?? null;
  const listingPageSize = 25;
  const filteredListingPanelItems = useMemo(() => {
    if (!listingPanelGroup || !displayProduct) return [];

    const normalizedQuery = listingSearchQuery.trim().toLowerCase();

    return listingPanelGroup.listings.filter((mapping) => {
      const matchesQuery =
        !normalizedQuery ||
        mapping.externalProductId.toLowerCase().includes(normalizedQuery) ||
        (mapping.label ?? "").toLowerCase().includes(normalizedQuery);
      const matchesFilter =
        listingFilter === "all" ||
        (listingFilter === "differences" && mapping.channelStock !== null && mapping.channelStock !== displayProduct.availableQuantity) ||
        (listingFilter === "pending" && mapping.syncStatus === "pending_update") ||
        (listingFilter === "failed" && mapping.syncStatus === "failed");

      return matchesQuery && matchesFilter;
    });
  }, [displayProduct, listingFilter, listingPanelGroup, listingSearchQuery]);
  const listingPageCount = Math.max(1, Math.ceil(filteredListingPanelItems.length / listingPageSize));
  const visibleListingPanelItems = filteredListingPanelItems.slice(
    (Math.min(listingPage, listingPageCount) - 1) * listingPageSize,
    Math.min(listingPage, listingPageCount) * listingPageSize,
  );

  const totalPendingMappings = products.reduce((total, product) => total + product.pendingCount, 0);
  const totalFailedMappings = products.reduce((total, product) => total + product.failedCount, 0);
  const totalSupportedMappings = products.reduce((total, product) => total + product.mappingCount, 0);
  const totalMismatchMappings = products.reduce((total, product) => total + product.mismatchCount, 0);
  const hasActiveQueueFilter = searchQuery.trim() !== "" || statusFilter !== "all" || channelFilter !== "all";

  function toggleChannel(channelKey: string) {
    setExpandedChannels((current) => {
      const next = new Set(current);
      if (next.has(channelKey)) next.delete(channelKey);
      else next.add(channelKey);
      return next;
    });
  }

  function openListingPanel(groupKey: string) {
    setListingPanelGroupKey(groupKey);
    setListingSearchQuery("");
    setListingFilter("all");
    setListingPage(1);
    setConfirmPushProduct(null);
  }

  function updateListingFilter(value: string) {
    setListingFilter(value as ListingFilter);
    setListingPage(1);
  }

  function updateSearchQuery(value: string) {
    setSearchQuery(value);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      const nextQuery = value.trim();
      const currentQuery = searchParams.get("q") ?? "";
      if (nextQuery === currentQuery) return;

      closeProductPanel();
      replaceQueueParams({ q: nextQuery || null });
    }, 400);
  }

  function updateStatusFilter(value: string) {
    setStatusFilter(value);
    closeProductPanel();
    replaceQueueParams({ status: value });
  }

  function updateChannelFilter(value: string) {
    setChannelFilter(value);
    closeProductPanel();
    replaceQueueParams({ channel: value });
  }

  function updatePage(page: number) {
    replaceQueueParams({ page: String(Math.max(1, Math.min(page, totalPages))) });
  }

  function updatePageSize(value: string) {
    replaceQueueParams({ limit: value, page: "1" });
  }

  function openProduct(productId: number) {
    setRequestedProductId(productId);
    setListingPanelGroupKey(null);
    setConfirmPushProduct(null);
  }

  function requestStockPush(product: SyncProduct) {
    if (!product.id) {
      toast.info("Open a product with a supported channel mapping first.");
      return;
    }

    if (isAnyJobRunning) {
      toast.info("Stock push already in progress", {
        description: "Wait for the current product to finish before starting another push.",
      });
      return;
    }

    setConfirmPushProduct(product);
  }

  function startConfirmedStockPush() {
    if (!confirmPushProduct) return;
    const productId = confirmPushProduct.id;

    startTransition(async () => {
      try {
        const result = await startStockPushJob(productId);

        if ("error" in result) {
          toast.error("Could not start stock push", { description: result.error });
          return;
        }

        if (!("success" in result) || !result.success) {
          toast.error("Could not start stock push");
          return;
        }

        setActiveJob(result.job);
        setConfirmPushProduct(null);
        toast.info("Stock push started", {
          description: `Reconciling ${result.job.totalCount} mapped listing${result.job.totalCount === 1 ? "" : "s"}.`,
        });
      } catch {
        toast.error("Could not start stock push", {
          description: "The request did not complete.",
        });
      }
    });
  }

  if (totalCount === 0 && !hasActiveQueueFilter) {
    return (
      <div className="rounded-lg border bg-background px-6 py-16 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold">All channel stock is in sync</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          New order reservations, delivered orders, returns, invoices, and manual stock adjustments will appear here when mapped products need a channel stock push.
        </p>
      </div>
    );
  }

  return (
    <div className="-mx-6 -mb-6 border-t bg-background">
      {totalFailedMappings > 0 && (
        <div className="border-b bg-red-50 px-6 py-2 text-sm text-red-700">
          {totalFailedMappings} mapping{totalFailedMappings === 1 ? "" : "s"} failed last push. Review the failed listings before retrying.
        </div>
      )}

      <section className="relative min-h-[680px]">
        <div className="border-b xl:border-b-0">
          <div className="border-b px-6 py-5">
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
              <div>
                <h2 className="text-base font-semibold">Products needing action</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {totalCount} product{totalCount === 1 ? "" : "s"} - {totalSupportedMappings} listing{totalSupportedMappings === 1 ? "" : "s"} on this page
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <CommandMetric icon={Box} label="Products" value={products.length} />
              <CommandMetric icon={ShoppingBag} label="Listings" value={totalPendingMappings} tone="amber" />
              <CommandMetric icon={XCircle} label="Mismatches" value={totalMismatchMappings} tone="red" />
              <CommandMetric icon={ShieldCheck} label="Ready targets" value={totalSupportedMappings} tone="green" />
            </div>

            <div className="mt-4 flex flex-col gap-3 2xl:flex-row 2xl:items-center">
              <Tabs value={statusFilter} onValueChange={updateStatusFilter}>
                <TabsList className="h-9">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="ready">Ready</TabsTrigger>
                  <TabsTrigger value="review">Review</TabsTrigger>
                  <TabsTrigger value="failed">Failed</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px] 2xl:flex-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => updateSearchQuery(event.target.value)}
                    placeholder="Search product, SKU..."
                    className="h-9 pl-9"
                  />
                </div>
                <Select value={channelFilter} onValueChange={updateChannelFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All channels</SelectItem>
                    {channelOptions.map((channelName) => (
                      <SelectItem key={channelName} value={channelName}>
                        {channelName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="min-w-[260px] pl-6">Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Listings</TableHead>
                  <TableHead className="text-right">Mismatch</TableHead>
                  <TableHead className="pr-6">Last stock change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center text-sm text-muted-foreground">
                      No products match the current filters.
                    </TableCell>
                  </TableRow>
                )}

                {filteredProducts.map((product) => {
                  const action = getProductAction(product);
                  const isActive = product.id === activeProductId;

                  return (
                    <TableRow
                      key={product.id}
                      data-state={isActive ? "selected" : undefined}
                      className={cn(
                        "cursor-pointer",
                        isActive && "border-l-2 border-l-primary bg-blue-50/70 hover:bg-blue-50/70",
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        openProduct(product.id);
                      }}
                    >
                      <TableCell className="max-w-[320px] whitespace-normal py-3 pl-6">
                        <p className="line-clamp-2 font-medium leading-snug text-primary">{product.name}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{product.sku ?? "No SKU"}</p>
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={action} />
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                        {product.availableQuantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {product.mappingCount}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", product.mismatchCount > 0 && "text-red-600")}>
                        {product.mismatchCount}
                      </TableCell>
                      <TableCell className="pr-6 text-xs text-muted-foreground">
                        {product.lastTransactionAt ? (
                          <>
                            <span className="font-medium text-foreground">{formatDate(product.lastTransactionAt)}</span>
                            <br />
                            {formatTime(product.lastTransactionAt)}
                          </>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="divide-y md:hidden">
            {filteredProducts.length === 0 && (
              <div className="px-6 py-14 text-center text-sm text-muted-foreground">
                No products match the current filters.
              </div>
            )}

            {filteredProducts.map((product) => {
              const action = getProductAction(product);
              const isActive = product.id === activeProductId;

              return (
                <div
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    openProduct(product.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.stopPropagation();
                      openProduct(product.id);
                    }
                  }}
                  className={cn(
                    "block w-full cursor-pointer px-5 py-4 text-left transition-colors",
                    isActive && "border-l-2 border-l-primary bg-blue-50/70",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-2 font-medium leading-snug text-primary">{product.name}</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">{product.sku ?? "No SKU"}</p>
                        </div>
                        <ActionBadge action={action} />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <MobileProductMetric label="Available" value={product.availableQuantity} tone="green" />
                        <MobileProductMetric label="Listings" value={product.mappingCount} />
                        <MobileProductMetric label="Mismatch" value={product.mismatchCount} tone={product.mismatchCount > 0 ? "red" : undefined} />
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Last stock change{" "}
                        {product.lastTransactionAt ? `${formatDate(product.lastTransactionAt)}, ${formatTime(product.lastTransactionAt)}` : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden items-center justify-between border-t px-6 py-4 text-sm text-muted-foreground md:flex">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={updatePageSize}>
                <SelectTrigger className="h-8 w-[72px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 100, 200, 500].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span>
              {totalCount === 0 ? "0-0" : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalCount)}`} of {totalCount}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" disabled={currentPage <= 1} onClick={() => updatePage(1)} className="h-8 w-8">
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled={currentPage <= 1} onClick={() => updatePage(currentPage - 1)} className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="rounded-md bg-blue-50 px-3 py-1 text-primary">{currentPage}</span>
              <Button variant="ghost" size="icon" disabled={currentPage >= totalPages} onClick={() => updatePage(currentPage + 1)} className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled={currentPage >= totalPages} onClick={() => updatePage(totalPages)} className="h-8 w-8">
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <Sheet
          open={!!displayProduct}
          onOpenChange={(open) => {
            if (!open) closeProductPanel();
          }}
        >
          <SheetContent
            side="right"
            showCloseButton={false}
            className="w-full gap-0 overflow-hidden p-0 sm:max-w-none md:w-[min(980px,78vw)] md:max-w-[980px]"
          >
            {displayProduct && (
              <div className="relative flex min-h-0 flex-1 flex-col">
                <SheetHeader className="flex flex-col gap-4 border-b px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <SheetTitle className="truncate text-lg font-semibold">{displayProduct.name}</SheetTitle>
                      <Button variant="ghost" size="icon" asChild className="h-7 w-7 shrink-0">
                        <Link href={`/products/${displayProduct.id}`} title="Open product">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <SheetDescription className="mt-1 text-sm text-muted-foreground">
                      SKU: <span className="font-mono">{displayProduct.sku ?? "No SKU"}</span>
                    </SheetDescription>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" asChild>
                      <Link href={`/products/${displayProduct.id}`} className="gap-2">
                        Open product
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={closeProductPanel} className="h-10 w-10">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </SheetHeader>

              <div className="border-b px-4 py-4 sm:px-6">
                <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 rounded-lg border bg-background p-2 sm:gap-3">
                  <StockEquationItem label="On hand" value={displayProduct.quantityOnHand} />
                  <span className="text-center text-muted-foreground">-</span>
                  <StockEquationItem
                    label="Reserved"
                    value={displayProduct.reservedQuantity}
                    tone={displayProduct.reservedQuantity > 0 ? "amber" : undefined}
                  />
                  <span className="text-center text-muted-foreground">=</span>
                  <StockEquationItem
                    label="Available"
                    value={displayProduct.availableQuantity}
                    tone={displayProduct.availableQuantity <= 0 ? "red" : "green"}
                    emphasis
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                <div className="mb-3 hidden grid-cols-[minmax(0,1fr)_80px_80px_90px_110px_90px] gap-3 px-1 text-xs font-medium text-muted-foreground md:grid">
                  <div className="text-sm font-semibold text-foreground">Channel breakdown</div>
                  <div className="text-right">Listings</div>
                  <div className="text-right">Pending</div>
                  <div className="text-right">Mismatches</div>
                  <div className="text-right">Stock range</div>
                  <div className="text-right">Status</div>
                </div>

                {detailLoadingId === displayProduct.id && (
                  <div className="flex h-80 items-center justify-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}

                {activeDetail && detailLoadingId !== displayProduct.id && (
                  <div className="overflow-hidden rounded-lg border">
                    {channelGroups.map((group, index) => {
                      const isExpanded = expandedChannels.has(group.key);
                      const action = getChannelAction(group);
                      const visibleListings = isExpanded ? group.listings.slice(0, 3) : [];

                      return (
                        <div key={group.key} className={cn(index > 0 && "border-t")}>
                          <button
                            type="button"
                            onClick={() => toggleChannel(group.key)}
                            className="w-full bg-muted/20 px-3 py-3 text-left text-sm transition-colors hover:bg-muted/40 md:grid md:grid-cols-[minmax(0,1fr)_80px_80px_90px_110px_90px] md:items-center md:gap-3"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !isExpanded && "-rotate-90")} />
                              <ChannelAvatar name={group.name} type={group.type} />
                              <span className="truncate font-semibold">{group.name}</span>
                            </div>
                            <div className="mt-3 grid grid-cols-4 gap-2 text-xs md:mt-0 md:contents">
                              <ChannelHeaderMetric label="Listings" value={group.listings.length} />
                              <ChannelHeaderMetric label="Pending" value={group.pendingCount} tone="orange" />
                              <ChannelHeaderMetric label="Mismatch" value={group.mismatchCount} tone="red" />
                              <ChannelHeaderMetric label="Stock" value={getStockRangeLabel(group.channelStockMin, group.channelStockMax)} />
                            </div>
                            <div className="mt-3 text-left md:mt-0 md:text-right">
                              <ActionBadge action={action} />
                            </div>
                          </button>

                          {isExpanded && (
                            <div>
                              <div className="hidden grid-cols-[120px_minmax(220px,1fr)_100px_100px_100px_90px] gap-3 border-y bg-muted/10 px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
                                <div>External ID</div>
                                <div>Listing title</div>
                                <div className="text-right">Channel stock</div>
                                <div className="text-right">SeplorX stock</div>
                                <div className="text-right">Outcome</div>
                                <div className="text-right">Status</div>
                              </div>
                              {visibleListings.map((mapping) => (
                                <div
                                  key={mapping.id}
                                  className="grid gap-3 border-b px-3 py-3 text-sm last:border-b-0 md:grid-cols-[120px_minmax(220px,1fr)_100px_100px_100px_90px]"
                                >
                                  <div className="font-mono text-xs font-medium">{mapping.externalProductId}</div>
                                  <div className="min-w-0">
                                    <p className="line-clamp-2 text-primary">{mapping.label ?? "View channel item"}</p>
                                    {mapping.lastSyncError && <p className="mt-1 line-clamp-2 text-xs text-red-600">{mapping.lastSyncError}</p>}
                                  </div>
                                  <div className="flex items-center justify-between text-xs md:block md:text-right md:text-sm">
                                    <span className="text-muted-foreground md:hidden">Channel</span>
                                    <span className="font-medium tabular-nums">
                                    {mapping.channelStock ?? "-"}
                                    {mapping.channelStock !== null && mapping.channelStock !== displayProduct.availableQuantity && (
                                      <span className="block text-xs text-muted-foreground">({mapping.channelStock})</span>
                                    )}
                                    </span>
                                  </div>
                                  <div className="hidden text-right font-medium tabular-nums md:block">{displayProduct.availableQuantity}</div>
                                  <div className="flex items-center justify-between text-xs md:block md:text-right md:text-sm">
                                    <span className="text-muted-foreground md:hidden">Outcome</span>
                                    <span>Set to {displayProduct.availableQuantity}</span>
                                  </div>
                                  <div className="text-left md:text-right">
                                    <StatusBadge
                                      status={activeJobItemsByMappingId.get(mapping.id)?.status ?? mapping.syncStatus}
                                      ready={mapping.channelStock === displayProduct.availableQuantity}
                                    />
                                  </div>
                                </div>
                              ))}
                              {group.listings.length > 3 && (
                                <button
                                  type="button"
                                  className="w-full border-t px-3 py-2 text-left text-sm text-primary hover:bg-muted/20"
                                  onClick={() => openListingPanel(group.key)}
                                >
                                  View all {group.listings.length} listings
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 grid gap-3 border-t bg-background/95 px-6 py-4 backdrop-blur lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
                {activeProductJob && (
                  <ReconciliationProgress job={activeProductJob} isPolling={isPollingJob} />
                )}
                <div className="flex min-w-0 items-center gap-3">
                  <div className="hidden h-12 w-12 items-center justify-center rounded-md border bg-muted text-xs font-semibold text-muted-foreground sm:flex">
                    SKU
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{displayProduct.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">SKU: {displayProduct.sku ?? "No SKU"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 overflow-hidden rounded-md border text-center text-sm">
                  <BottomMetric label="Available" value={displayProduct.availableQuantity} tone="green" />
                  <BottomMetric label="Listings" value={displayProduct.mappingCount} />
                  <BottomMetric label="Mismatches" value={displayProduct.mismatchCount} tone="red" />
                </div>
                {confirmPushProduct?.id === displayProduct.id ? (
                  <InlinePushConfirmation
                    product={displayProduct}
                    isPending={isPending}
                    onCancel={() => setConfirmPushProduct(null)}
                    onConfirm={startConfirmedStockPush}
                  />
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" asChild>
                      <Link href={`/products/${displayProduct.id}`} className="gap-2">
                        Open product
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      disabled={isPending || isAnyJobRunning || displayProduct.mappingCount === 0}
                      onClick={() => requestStockPush(displayProduct)}
                      className="gap-2"
                    >
                      {isAnyJobRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
                      {isActiveJobRunning
                        ? `Pushing ${getCompletedJobCount(activeProductJob)} / ${activeProductJob.totalCount}`
                        : isAnyJobRunning
                          ? "Push in progress"
                        : "Push this product"}
                    </Button>
                  </div>
                )}
              </div>

              {listingPanelGroup && (
                <ListingPanel
                  group={listingPanelGroup}
                  product={displayProduct}
                  listings={visibleListingPanelItems}
                  filteredCount={filteredListingPanelItems.length}
                  page={Math.min(listingPage, listingPageCount)}
                  pageCount={listingPageCount}
                  pageSize={listingPageSize}
                  searchQuery={listingSearchQuery}
                  filter={listingFilter}
                  isPending={isPending}
                  isPushLocked={isAnyJobRunning}
                  isConfirmingPush={confirmPushProduct?.id === displayProduct.id}
                  job={activeProductJob}
                  jobItemsByMappingId={activeJobItemsByMappingId}
                  onSearchChange={(value) => {
                    setListingSearchQuery(value);
                    setListingPage(1);
                  }}
                  onFilterChange={updateListingFilter}
                  onPageChange={setListingPage}
                  onClose={() => setListingPanelGroupKey(null)}
                  onPush={() => requestStockPush(displayProduct)}
                  onCancelPush={() => setConfirmPushProduct(null)}
                  onConfirmPush={startConfirmedStockPush}
                />
              )}
              </div>
            )}
          </SheetContent>
        </Sheet>
      </section>
    </div>
  );
}

function normalizeProductDetail(product: {
  id: number;
  name: string;
  sku: string | null;
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number;
  reorderLevel: number;
  lastTransactionAt: Date | string | null;
  lastTransactionNotes: string | null;
  mappings: SyncMapping[];
}): SyncProductDetail {
  return {
    ...product,
    mappingCount: product.mappings.length,
    pendingCount: product.mappings.filter((mapping) => mapping.syncStatus === "pending_update").length,
    failedCount: product.mappings.filter((mapping) => mapping.syncStatus === "failed").length,
    unknownStockCount: product.mappings.filter((mapping) => mapping.channelStock === null).length,
    mismatchCount: product.mappings.filter((mapping) => mapping.channelStock !== null && mapping.channelStock !== product.availableQuantity).length,
    channelStockMin: getMinChannelStock(product.mappings),
    channelStockMax: getMaxChannelStock(product.mappings),
    channelNames: Array.from(new Set(product.mappings.map((mapping) => mapping.channelName))).sort(),
  };
}

function getChannelGroups(product: SyncProductDetail): ChannelGroup[] {
  const grouped = new Map<string, ChannelGroup>();

  for (const mapping of product.mappings) {
    const key = String(mapping.channelId);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        key,
        name: mapping.channelName,
        type: mapping.channelType,
        listings: [],
        pendingCount: 0,
        failedCount: 0,
        unknownStockCount: 0,
        mismatchCount: 0,
        channelStockMin: null,
        channelStockMax: null,
        canPushStock: mapping.canPushStock,
      });
    }

    const group = grouped.get(key)!;
    group.listings.push(mapping);
    group.canPushStock = group.canPushStock || mapping.canPushStock;
    if (mapping.syncStatus === "pending_update") group.pendingCount += 1;
    if (mapping.syncStatus === "failed") group.failedCount += 1;
    if (mapping.channelStock === null) group.unknownStockCount += 1;
    if (mapping.channelStock !== null && mapping.channelStock !== product.availableQuantity) {
      group.mismatchCount += 1;
    }
    if (mapping.channelStock !== null) {
      group.channelStockMin = group.channelStockMin === null ? mapping.channelStock : Math.min(group.channelStockMin, mapping.channelStock);
      group.channelStockMax = group.channelStockMax === null ? mapping.channelStock : Math.max(group.channelStockMax, mapping.channelStock);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const scoreDiff = getChannelPriorityScore(b) - getChannelPriorityScore(a);
    return scoreDiff || a.name.localeCompare(b.name);
  });
}

function CommandMetric({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Box;
  label: string;
  value: number;
  tone?: "default" | "amber" | "green" | "red";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-700"
      : tone === "green"
        ? "text-emerald-700"
        : tone === "red"
          ? "text-red-700"
          : "text-foreground";
  const iconClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-600"
      : tone === "green"
        ? "bg-emerald-50 text-emerald-600"
        : tone === "red"
          ? "bg-red-50 text-red-600"
          : "bg-blue-50 text-blue-600";

  return (
    <div className="flex items-center gap-3 border-r px-4 py-2 last:border-r-0">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconClass)}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-semibold tabular-nums", toneClass)}>{value}</p>
      </div>
    </div>
  );
}

function StockEquationItem({
  label,
  value,
  tone,
  emphasis = false,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber" | "red";
  emphasis?: boolean;
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-orange-700"
        : tone === "red"
          ? "text-red-700"
          : "text-foreground";

  return (
    <div className={cn("rounded-md px-4 py-2", emphasis && "bg-emerald-50")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", toneClass)}>{value}</p>
    </div>
  );
}

function BottomMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "red";
}) {
  return (
    <div className="border-r px-4 py-2 last:border-r-0">
      <p className={cn("text-xs font-medium", tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-600" : "text-muted-foreground")}>
        {label}
      </p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function MobileProductMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "red";
}) {
  return (
    <div className="rounded-md border bg-background px-2 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("font-semibold tabular-nums", tone === "green" && "text-emerald-700", tone === "red" && "text-red-600")}>
        {value}
      </p>
    </div>
  );
}

function ChannelHeaderMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "orange" | "red";
}) {
  return (
    <div className="rounded-md border bg-background px-2 py-1.5 text-right md:border-0 md:bg-transparent md:p-0">
      <p className="text-[11px] text-muted-foreground md:hidden">{label}</p>
      <p className={cn("font-medium tabular-nums", tone === "orange" && "text-orange-600", tone === "red" && "text-red-600")}>
        {value}
      </p>
    </div>
  );
}

function ChannelAvatar({ name, type, size = "sm" }: { name: string; type: string; size?: "sm" | "md" }) {
  const icon = getChannelById(type as ChannelType)?.icon ?? null;
  const dimensionClass = size === "md" ? "h-9 w-9" : "h-6 w-6";
  const imageClass = size === "md" ? "h-6 w-6" : "h-4 w-4";

  if (icon) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-md border bg-background", dimensionClass)}>
        <Image src={icon} alt={`${name} logo`} width={24} height={24} className={cn("object-contain", imageClass)} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground",
        dimensionClass,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function ListingPanel({
  group,
  product,
  listings,
  filteredCount,
  page,
  pageCount,
  pageSize,
  searchQuery,
  filter,
  isPending,
  isPushLocked,
  isConfirmingPush,
  job,
  jobItemsByMappingId,
  onSearchChange,
  onFilterChange,
  onPageChange,
  onClose,
  onPush,
  onCancelPush,
  onConfirmPush,
}: {
  group: ChannelGroup;
  product: SyncProduct;
  listings: SyncMapping[];
  filteredCount: number;
  page: number;
  pageCount: number;
  pageSize: number;
  searchQuery: string;
  filter: ListingFilter;
  isPending: boolean;
  isPushLocked: boolean;
  isConfirmingPush: boolean;
  job: StockPushJob | null;
  jobItemsByMappingId: Map<number, StockPushJobItem>;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: string) => void;
  onPageChange: (value: number) => void;
  onClose: () => void;
  onPush: () => void;
  onCancelPush: () => void;
  onConfirmPush: () => void;
}) {
  const firstItem = filteredCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, filteredCount);
  const action = getChannelAction(group);
  const isPushing = !!job && (job.status === "queued" || job.status === "processing");
  const isBlockedByOtherPush = isPushLocked && !isPushing;

  return (
    <div className="fixed inset-0 z-50 flex flex-col border-l bg-background shadow-2xl md:absolute md:inset-y-0 md:left-auto md:right-0 md:w-[min(760px,100%)]">
      <div className="border-b px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <ChannelAvatar name={group.name} type={group.type} size="md" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold">{group.name} listings</h3>
                <ActionBadge action={action} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {group.listings.length} mapped listings - {group.mismatchCount} stock differences - Push outcome: set to {product.availableQuantity}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search external ID or listing title"
              className="h-9 pl-9"
            />
          </div>
          <Tabs value={filter} onValueChange={onFilterChange}>
            <TabsList className="h-9">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="differences">Differences</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="failed">Failed</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="hidden grid-cols-[120px_minmax(240px,1fr)_100px_90px_100px_90px] gap-3 border-b bg-muted/20 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
          <div>External ID</div>
          <div>Listing title</div>
          <div className="text-right">Channel stock</div>
          <div className="text-right">SeplorX</div>
          <div className="text-right">Outcome</div>
          <div className="text-right">Status</div>
        </div>

        {listings.length === 0 && (
          <div className="px-5 py-16 text-center text-sm text-muted-foreground">
            No listings match the current filters.
          </div>
        )}

        <div className="divide-y">
          {listings.map((mapping) => (
            <div
              key={mapping.id}
              className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[120px_minmax(240px,1fr)_100px_90px_100px_90px] md:gap-3"
            >
              <div className="font-mono text-xs font-medium">{mapping.externalProductId}</div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-primary">{mapping.label ?? "View channel item"}</p>
                {mapping.lastSyncError && <p className="mt-1 line-clamp-2 text-xs text-red-600">{mapping.lastSyncError}</p>}
              </div>
              <div className="flex items-center justify-between text-xs md:block md:text-right md:text-sm">
                <span className="text-muted-foreground md:hidden">Channel</span>
                <span className="font-medium tabular-nums">{mapping.channelStock ?? "-"}</span>
              </div>
              <div className="hidden text-right font-medium tabular-nums md:block">{product.availableQuantity}</div>
              <div className="flex items-center justify-between text-xs md:block md:text-right md:text-sm">
                <span className="text-muted-foreground md:hidden">
                  Channel {mapping.channelStock ?? "-"} {"->"} SeplorX {product.availableQuantity}
                </span>
                <span>Set to {product.availableQuantity}</span>
              </div>
              <div className="text-left md:text-right">
                <StatusBadge
                  status={jobItemsByMappingId.get(mapping.id)?.status ?? mapping.syncStatus}
                  ready={mapping.channelStock === product.availableQuantity}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 border-t bg-background px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground sm:justify-start">
          <span>
            {firstItem}-{lastItem} of {filteredCount}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-8 text-center tabular-nums">{page}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={page >= pageCount}
              onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {isConfirmingPush ? (
          <InlinePushConfirmation
            product={product}
            isPending={isPending}
            onCancel={onCancelPush}
            onConfirm={onConfirmPush}
          />
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">
              Close
            </Button>
            <Button onClick={onPush} disabled={isPending || isPushLocked || product.mappingCount === 0} className="flex-1 gap-2 sm:flex-none">
              {isPushLocked ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
              {isPushing && job
                ? `Pushing ${getCompletedJobCount(job)} / ${job.totalCount}`
                : isBlockedByOtherPush
                  ? "Push in progress"
                  : "Push this product"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function InlinePushConfirmation({
  product,
  isPending,
  onCancel,
  onConfirm,
}: {
  product: SyncProduct;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:items-end lg:min-w-[360px]">
      <p className="text-xs text-muted-foreground">
        Confirm push: set {product.mappingCount} mapped listing{product.mappingCount === 1 ? "" : "s"} to{" "}
        <span className="font-semibold text-foreground">{product.availableQuantity}</span>.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={isPending} className="gap-2">
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isPending ? "Starting..." : "Push stock"}
        </Button>
      </div>
    </div>
  );
}

function ReconciliationProgress({ job, isPolling }: { job: StockPushJob; isPolling: boolean }) {
  const completed = getCompletedJobCount(job);
  const progress = job.totalCount === 0 ? 0 : Math.round((completed / job.totalCount) * 100);
  const running = job.status === "queued" || job.status === "processing";
  const recentItems = job.items
    .filter((item) => item.status !== "pending")
    .slice()
    .reverse()
    .slice(0, 4);

  return (
    <div className="space-y-3 rounded-lg border bg-blue-50/60 p-3 lg:col-span-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-950">
            {running ? "Reconciling channel stock" : job.status === "done" ? "Stock reconciliation complete" : "Stock reconciliation finished with failures"}
          </p>
          <p className="text-xs text-blue-700">
            {completed} of {job.totalCount} listings processed - {job.pushedCount} updated, {job.failedCount} failed, {job.skippedCount} skipped
          </p>
        </div>
        {running && (
          <div className="flex items-center gap-2 text-xs font-medium text-blue-700">
            <Loader2 className={cn("h-3.5 w-3.5", isPolling && "animate-spin")} />
            Updating live
          </div>
        )}
      </div>
      <Progress value={progress} className="h-2" />
      {recentItems.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {recentItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border bg-background px-2 py-1.5 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium">{item.channelName}</p>
                <p className="truncate font-mono text-muted-foreground">{item.externalProductId}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: { label: string; className: string } }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", action.className)}>
      {action.label}
    </span>
  );
}

function StatusBadge({ status, ready = false }: { status: string; ready?: boolean }) {
  if (ready && status === "pending_update") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Ready
      </span>
    );
  }

  const ui = STATUS_UI[status] ?? {
    label: status.replace(/_/g, " "),
    className: "border-border bg-muted text-muted-foreground",
  };

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize", ui.className)}>
      {ui.label}
    </span>
  );
}

function getProductAction(product: SyncProduct) {
  if (product.failedCount > 0) {
    return {
      kind: "failed",
      label: "Failed",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (product.mismatchCount > 0 || product.unknownStockCount > 0) {
    return {
      kind: "review",
      label: "Review",
      className: "border-yellow-200 bg-yellow-50 text-yellow-700",
    };
  }

  return {
    kind: "ready",
    label: "Ready",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

function getChannelAction(group: ChannelGroup) {
  if (!group.canPushStock) {
    return {
      label: "Unsupported",
      className: "border-muted bg-muted text-muted-foreground",
    };
  }

  if (group.failedCount > 0) {
    return {
      label: "Failed",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (group.mismatchCount > 0 || group.unknownStockCount > 0) {
    return {
      label: "Review",
      className: "border-yellow-200 bg-yellow-50 text-yellow-700",
    };
  }

  return {
    label: "Ready",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

function getChannelPriorityScore(group: ChannelGroup) {
  return group.failedCount * 100000 + group.mismatchCount * 1000 + group.pendingCount;
}

function getCompletedJobCount(job: StockPushJob) {
  return job.pushedCount + job.failedCount + job.skippedCount;
}

function getStockRangeLabel(min: number | null, max: number | null) {
  if (min === null || max === null) return "-";
  return min === max ? String(min) : `${min} - ${max}`;
}

function getMinChannelStock(mappings: SyncMapping[]) {
  const values = mappings
    .map((mapping) => mapping.channelStock)
    .filter((value): value is number => typeof value === "number");
  return values.length === 0 ? null : Math.min(...values);
}

function getMaxChannelStock(mappings: SyncMapping[]) {
  const values = mappings
    .map((mapping) => mapping.channelStock)
    .filter((value): value is number => typeof value === "number");
  return values.length === 0 ? null : Math.max(...values);
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}
