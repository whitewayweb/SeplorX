"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getStockSyncProductDetails, pushSelectedProductStock } from "./actions";

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
}

const STATUS_UI: Record<string, { label: string; className: string }> = {
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
  processing: {
    label: "Processing",
    className: "border-purple-200 bg-purple-50 text-purple-700",
  },
};

export function StockSyncQueue({ products }: StockSyncQueueProps) {
  const router = useRouter();
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set());
  const [requestedProductId, setRequestedProductId] = useState<number | null>(products[0]?.id ?? null);
  const [detailCache, setDetailCache] = useState<Record<number, SyncProductDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());
  const [pushingIds, setPushingIds] = useState<Set<number>>(new Set());
  const [confirmProductIds, setConfirmProductIds] = useState<number[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const channelOptions = useMemo(() => {
    return Array.from(new Set(products.flatMap((p) => p.channelNames))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return products
      .filter((product) => {
        const matchesSearch =
          !normalizedQuery ||
          product.name.toLowerCase().includes(normalizedQuery) ||
          (product.sku ?? "").toLowerCase().includes(normalizedQuery) ||
          product.channelNames.some((channelName) =>
            channelName.toLowerCase().includes(normalizedQuery),
          );

        const matchesChannel =
          channelFilter === "all" || product.channelNames.includes(channelFilter);

        const action = getProductAction(product);
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "ready" && action.kind === "ready") ||
          (statusFilter === "review" && action.kind === "review") ||
          (statusFilter === "failed" && action.kind === "failed");

        return matchesSearch && matchesChannel && matchesStatus;
      })
      .sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
  }, [channelFilter, products, searchQuery, statusFilter]);

  const activeProductId =
    requestedProductId && filteredProducts.some((product) => product.id === requestedProductId)
      ? requestedProductId
      : filteredProducts[0]?.id ?? null;

  const loadProductDetail = useCallback(async (productId: number, isCancelled: () => boolean) => {
    setDetailLoadingId(productId);
    const result = await getStockSyncProductDetails(productId);
    if (isCancelled()) return;

    setDetailLoadingId(null);

    if (result.error) {
      toast.error("Could not load mappings", { description: result.error });
      return;
    }

    if ("success" in result && result.success) {
      const product = normalizeProductDetail(result.product);
      setDetailCache((current) => ({ ...current, [product.id]: product }));
      setExpandedChannels(new Set(product.mappings.map((mapping) => String(mapping.channelId))));
    }
  }, []);

  useEffect(() => {
    if (!activeProductId || detailCache[activeProductId]) return;

    let cancelled = false;
    void Promise.resolve().then(() => loadProductDetail(activeProductId, () => cancelled));

    return () => {
      cancelled = true;
    };
  }, [activeProductId, detailCache, loadProductDetail]);

  const actionableProductIds = useMemo(
    () => filteredProducts.filter((p) => p.mappingCount > 0).map((p) => p.id),
    [filteredProducts],
  );

  const activeSummary = products.find((product) => product.id === activeProductId) ?? null;
  const activeDetail = activeProductId ? detailCache[activeProductId] ?? null : null;
  const displayProduct = activeDetail ?? activeSummary;
  const channelGroups = useMemo(
    () => (activeDetail ? getChannelGroups(activeDetail) : []),
    [activeDetail],
  );

  const allSelected =
    actionableProductIds.length > 0 &&
    actionableProductIds.every((id) => selectedProductIds.has(id));
  const someSelected = selectedProductIds.size > 0 && !allSelected;
  const totalPendingMappings = products.reduce((total, product) => total + product.pendingCount, 0);
  const totalFailedMappings = products.reduce((total, product) => total + product.failedCount, 0);
  const totalSupportedMappings = products.reduce((total, product) => total + product.mappingCount, 0);
  const totalMismatchMappings = products.reduce((total, product) => total + product.mismatchCount, 0);
  const confirmProducts = confirmProductIds
    ? products.filter((product) => confirmProductIds.includes(product.id))
    : [];
  const confirmMappingCount = confirmProducts.reduce((total, product) => total + product.mappingCount, 0);
  const confirmChannelNames = Array.from(
    new Set(confirmProducts.flatMap((product) => product.channelNames)),
  ).sort();

  function toggleAll(checked: boolean | "indeterminate") {
    if (checked === true) {
      setSelectedProductIds(new Set(actionableProductIds));
    } else {
      setSelectedProductIds(new Set());
    }
  }

  function toggleProduct(productId: number, checked: boolean) {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  function toggleChannel(channelKey: string) {
    setExpandedChannels((current) => {
      const next = new Set(current);
      if (next.has(channelKey)) next.delete(channelKey);
      else next.add(channelKey);
      return next;
    });
  }

  function requestPush(productIds: number[], confirm = true) {
    const uniqueProductIds = Array.from(new Set(productIds));
    if (uniqueProductIds.length === 0) {
      toast.info("Select at least one product with a supported channel mapping.");
      return;
    }
    if (confirm && uniqueProductIds.length > 1) {
      setConfirmProductIds(uniqueProductIds);
      return;
    }
    pushProducts(uniqueProductIds);
  }

  function pushProducts(productIds: number[]) {
    const uniqueProductIds = Array.from(new Set(productIds));
    if (uniqueProductIds.length === 0) {
      toast.info("Select at least one product with a supported channel mapping.");
      return;
    }

    setPushingIds(new Set(uniqueProductIds));
    startTransition(async () => {
      const result = await pushSelectedProductStock(uniqueProductIds);
      setPushingIds(new Set());

      if (result.error) {
        toast.error("Stock push failed", { description: result.error });
        return;
      }

      if (!("success" in result) || !result.success) {
        toast.error("Stock push failed");
        return;
      }

      if (result.failed === 0) {
        toast.success("Stock pushed", {
          description: `${result.pushed} mapping${result.pushed === 1 ? "" : "s"} updated across ${result.products} product${result.products === 1 ? "" : "s"}.`,
        });
      } else {
        const firstFailure = result.results.find((r) => !r.ok && !r.skipped);
        toast.warning(`${result.pushed} succeeded, ${result.failed} failed`, {
          description: firstFailure
            ? `${firstFailure.channelName} / ${firstFailure.label ?? firstFailure.externalProductId}: ${firstFailure.error}`
            : undefined,
        });
      }

      setSelectedProductIds(new Set());
      setDetailCache({});
      setConfirmProductIds(null);
      router.refresh();
    });
  }

  if (products.length === 0) {
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
      <section className="flex flex-col gap-4 border-b px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 gap-0 sm:grid-cols-2 lg:max-w-3xl lg:grid-cols-4">
          <CommandMetric icon={Box} label="Products" value={products.length} />
          <CommandMetric icon={ShoppingBag} label="Listings" value={totalPendingMappings} tone="amber" />
          <CommandMetric icon={XCircle} label="Mismatches" value={totalMismatchMappings} tone="red" />
          <CommandMetric icon={ShieldCheck} label="Ready targets" value={totalSupportedMappings} tone="green" />
        </div>
        <Button
          onClick={() => requestPush(actionableProductIds)}
          disabled={isPending || actionableProductIds.length === 0}
          className="gap-2 lg:mr-2"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
          Push All Pending
        </Button>
      </section>

      {totalFailedMappings > 0 && (
        <div className="border-b bg-red-50 px-6 py-2 text-sm text-red-700">
          {totalFailedMappings} mapping{totalFailedMappings === 1 ? "" : "s"} failed last push. Review the failed listings before retrying.
        </div>
      )}

      <section className="grid min-h-[680px] xl:grid-cols-[minmax(560px,42%)_minmax(0,1fr)]">
        <div className="border-b xl:border-b-0 xl:border-r">
          <div className="border-b px-6 py-5">
            <h2 className="text-base font-semibold">Products needing action</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"} - {totalSupportedMappings} listing{totalSupportedMappings === 1 ? "" : "s"} affected
            </p>

            <div className="mt-4 flex flex-col gap-3 2xl:flex-row 2xl:items-center">
              <Tabs value={statusFilter} onValueChange={setStatusFilter}>
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
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search product, SKU..."
                    className="h-9 pl-9"
                  />
                </div>
                <Select value={channelFilter} onValueChange={setChannelFilter}>
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

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="w-10 px-6">
                    <Checkbox
                      checked={allSelected || (someSelected ? "indeterminate" : false)}
                      onCheckedChange={toggleAll}
                      aria-label="Select all visible products"
                    />
                  </TableHead>
                  <TableHead className="min-w-[210px]">Product</TableHead>
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
                    <TableCell colSpan={7} className="h-48 text-center text-sm text-muted-foreground">
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
                      onClick={() => setRequestedProductId(product.id)}
                    >
                      <TableCell className="px-6" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selectedProductIds.has(product.id)}
                          disabled={product.mappingCount === 0}
                          onCheckedChange={(checked) => toggleProduct(product.id, checked === true)}
                          aria-label={`Select ${product.name}`}
                        />
                      </TableCell>
                      <TableCell className="max-w-[260px] whitespace-normal py-3">
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

          <div className="flex items-center justify-between border-t px-6 py-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <Select value="10">
                <SelectTrigger className="h-8 w-[72px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span>
              {filteredProducts.length === 0 ? "0-0" : `1-${filteredProducts.length}`} of {filteredProducts.length}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" disabled className="h-8 w-8">
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="rounded-md bg-blue-50 px-3 py-1 text-primary">1</span>
              <Button variant="ghost" size="icon" disabled className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled className="h-8 w-8">
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="relative flex min-h-[680px] flex-col">
          {!displayProduct && (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              Select a product to review channel stock.
            </div>
          )}

          {displayProduct && (
            <>
              <div className="flex flex-col gap-4 border-b px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">{displayProduct.name}</h2>
                    <Button variant="ghost" size="icon" asChild className="h-7 w-7 shrink-0">
                      <Link href={`/products/${displayProduct.id}`} title="Open product">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    SKU: <span className="font-mono">{displayProduct.sku ?? "No SKU"}</span>
                  </p>
                </div>

                <Button variant="outline" asChild>
                  <Link href={`/products/${displayProduct.id}`} className="gap-2">
                    Open product
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <div className="border-b px-6 py-4">
                <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 rounded-lg border bg-background p-2">
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

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="mb-3 grid grid-cols-[minmax(0,1fr)_80px_80px_90px_110px_90px] gap-3 px-1 text-xs font-medium text-muted-foreground">
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
                            className="grid w-full grid-cols-[minmax(0,1fr)_80px_80px_90px_110px_90px] items-center gap-3 bg-muted/20 px-3 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !isExpanded && "-rotate-90")} />
                              <ChannelAvatar name={group.name} type={group.type} />
                              <span className="truncate font-semibold">{group.name}</span>
                            </div>
                            <div className="text-right font-medium tabular-nums">{group.listings.length}</div>
                            <div className="text-right font-medium tabular-nums text-orange-600">{group.pendingCount}</div>
                            <div className="text-right font-medium tabular-nums text-red-600">{group.mismatchCount}</div>
                            <div className="text-right font-medium tabular-nums">{getStockRangeLabel(group.channelStockMin, group.channelStockMax)}</div>
                            <div className="text-right">
                              <ActionBadge action={action} />
                            </div>
                          </button>

                          {isExpanded && (
                            <div>
                              <div className="grid grid-cols-[120px_minmax(220px,1fr)_100px_100px_100px_90px] gap-3 border-y bg-muted/10 px-3 py-2 text-xs font-medium text-muted-foreground">
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
                                  className="grid grid-cols-[120px_minmax(220px,1fr)_100px_100px_100px_90px] gap-3 border-b px-3 py-3 text-sm last:border-b-0"
                                >
                                  <div className="font-mono text-xs font-medium">{mapping.externalProductId}</div>
                                  <div className="min-w-0">
                                    <p className="line-clamp-2 text-primary">{mapping.label ?? "View channel item"}</p>
                                    {mapping.lastSyncError && <p className="mt-1 line-clamp-2 text-xs text-red-600">{mapping.lastSyncError}</p>}
                                  </div>
                                  <div className="text-right font-medium tabular-nums">
                                    {mapping.channelStock ?? "-"}
                                    {mapping.channelStock !== null && mapping.channelStock !== displayProduct.availableQuantity && (
                                      <span className="block text-xs text-muted-foreground">({mapping.channelStock})</span>
                                    )}
                                  </div>
                                  <div className="text-right font-medium tabular-nums">{displayProduct.availableQuantity}</div>
                                  <div className="text-right">Set to {displayProduct.availableQuantity}</div>
                                  <div className="text-right">
                                    <StatusBadge status={mapping.syncStatus} ready={mapping.channelStock === displayProduct.availableQuantity} />
                                  </div>
                                </div>
                              ))}
                              {group.listings.length > 3 && (
                                <button
                                  type="button"
                                  className="w-full border-t px-3 py-2 text-left text-sm text-primary hover:bg-muted/20"
                                  onClick={() => toast.info(`${group.listings.length} ${group.name} listings are included in this product push.`)}
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
                <div className="flex gap-2">
                  <Button variant="outline" asChild>
                    <Link href={`/products/${displayProduct.id}`} className="gap-2">
                      Open product
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    disabled={isPending || displayProduct.mappingCount === 0}
                    onClick={() => requestPush([displayProduct.id], false)}
                    className="gap-2"
                  >
                    {pushingIds.has(displayProduct.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
                    Push this product
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <Dialog open={!!confirmProductIds} onOpenChange={(open) => !open && setConfirmProductIds(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Push stock to channel listings?</DialogTitle>
            <DialogDescription>
              This will update every supported mapped listing for the selected SeplorX products.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <DialogMetric label="Products" value={confirmProducts.length} />
              <DialogMetric label="Listings" value={confirmMappingCount} />
              <DialogMetric label="Channels" value={confirmChannelNames.length} />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">Channels affected</p>
              <p className="mt-1 text-sm">{confirmChannelNames.join(", ") || "No supported channel targets"}</p>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-lg border">
              <div className="divide-y">
                {confirmProducts.map((product) => (
                  <div key={product.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{product.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{product.sku ?? "No SKU"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{product.availableQuantity}</p>
                      <p className="text-xs text-muted-foreground">available</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmProductIds(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={() => confirmProductIds && pushProducts(confirmProductIds)} disabled={isPending || confirmMappingCount === 0} className="gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
              Push {confirmMappingCount} listings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function DialogMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ChannelAvatar({ name, type }: { name: string; type: string }) {
  const label = type === "amazon" ? "a" : name.charAt(0).toUpperCase();
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
        type === "amazon"
          ? "bg-amber-50 text-foreground"
          : "bg-violet-50 text-violet-700",
      )}
    >
      {label}
    </span>
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
  if (ready && status !== "failed") {
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

function getPriorityScore(product: SyncProduct) {
  return product.failedCount * 100000 + product.mismatchCount * 1000 + product.pendingCount;
}

function getChannelPriorityScore(group: ChannelGroup) {
  return group.failedCount * 100000 + group.mismatchCount * 1000 + group.pendingCount;
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
