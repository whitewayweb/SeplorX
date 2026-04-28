"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUpFromLine,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Layers,
  Loader2,
  PackageCheck,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getStockSyncProductDetails, pushSelectedProductStock } from "./actions";

interface SyncMapping {
  id: number;
  channelName: string;
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

interface StockSyncQueueProps {
  products: SyncProduct[];
}

const STATUS_UI: Record<string, { label: string; className: string }> = {
  pending_update: {
    label: "Pending",
    className: "bg-yellow-50 text-yellow-700 border-yellow-200",
  },
  failed: {
    label: "Failed",
    className: "bg-red-50 text-red-700 border-red-200",
  },
  file_generating: {
    label: "Generating",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  uploading: {
    label: "Uploading",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  processing: {
    label: "Processing",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
};

export function StockSyncQueue({ products }: StockSyncQueueProps) {
  const router = useRouter();
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set());
  const [pushingIds, setPushingIds] = useState<Set<number>>(new Set());
  const [reviewProductId, setReviewProductId] = useState<number | null>(null);
  const [reviewProduct, setReviewProduct] = useState<SyncProductDetail | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [confirmProductIds, setConfirmProductIds] = useState<number[] | null>(null);
  const [reviewTab, setReviewTab] = useState("all");
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

        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "pending" && product.pendingCount > 0) ||
          (statusFilter === "failed" && product.failedCount > 0) ||
          (statusFilter === "mismatch" && product.mismatchCount > 0);

        return matchesSearch && matchesChannel && matchesStatus;
      })
      .sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
  }, [channelFilter, products, searchQuery, statusFilter]);

  const actionableProductIds = useMemo(
    () => filteredProducts.filter((p) => p.mappingCount > 0).map((p) => p.id),
    [filteredProducts],
  );

  const allSelected =
    actionableProductIds.length > 0 &&
    actionableProductIds.every((id) => selectedProductIds.has(id));
  const someSelected = selectedProductIds.size > 0 && !allSelected;
  const selectedProduct = reviewProduct;
  const totalPendingMappings = products.reduce((total, product) => total + product.pendingCount, 0);
  const totalFailedMappings = products.reduce((total, product) => total + product.failedCount, 0);
  const totalSupportedMappings = products.reduce((total, product) => total + product.mappingCount, 0);
  const totalMismatchMappings = products.reduce((total, product) => total + product.mismatchCount, 0);
  const selectedProducts = products.filter((product) => selectedProductIds.has(product.id));
  const selectedMappingCount = selectedProducts.reduce((total, product) => total + product.mappingCount, 0);
  const selectedChannelNames = Array.from(
    new Set(selectedProducts.flatMap((product) => product.channelNames)),
  ).sort();
  const visibleMappingCount = filteredProducts.reduce((total, product) => total + product.mappingCount, 0);
  const visibleMismatchMappings = filteredProducts.reduce((total, product) => total + product.mismatchCount, 0);
  const syncCoverage = totalSupportedMappings === 0
    ? 0
    : Math.round(((totalSupportedMappings - totalMismatchMappings) / totalSupportedMappings) * 100);
  const confirmProducts = confirmProductIds
    ? products.filter((product) => confirmProductIds.includes(product.id))
    : [];
  const confirmMappingCount = confirmProducts.reduce((total, product) => total + product.mappingCount, 0);
  const confirmChannelNames = Array.from(new Set(confirmProducts.flatMap((product) => product.channelNames))).sort();
  const reviewMappings = selectedProduct
    ? selectedProduct.mappings.filter((mapping) => {
      if (reviewTab === "mismatch") return mapping.channelStock !== null && mapping.channelStock !== selectedProduct.availableQuantity;
      if (reviewTab === "failed") return mapping.syncStatus === "failed";
      if (reviewTab === "unknown") return mapping.channelStock === null;
      return true;
    })
    : [];

  async function openReview(productId: number) {
    setReviewProductId(productId);
    setReviewProduct(null);
    setReviewLoading(true);
    const result = await getStockSyncProductDetails(productId);
    setReviewLoading(false);

    if (result.error) {
      toast.error("Could not load mappings", { description: result.error });
      setReviewProductId(null);
      return;
    }

    if ("success" in result && result.success) {
      const product = result.product;
      setReviewProduct({
        ...product,
        mappingCount: product.mappings.length,
        pendingCount: product.mappings.filter((mapping) => mapping.syncStatus === "pending_update").length,
        failedCount: product.mappings.filter((mapping) => mapping.syncStatus === "failed").length,
        unknownStockCount: product.mappings.filter((mapping) => mapping.channelStock === null).length,
        mismatchCount: product.mappings.filter((mapping) => mapping.channelStock !== null && mapping.channelStock !== product.availableQuantity).length,
        channelStockMin: getMinChannelStock(product.mappings),
        channelStockMax: getMaxChannelStock(product.mappings),
        channelNames: Array.from(new Set(product.mappings.map((mapping) => mapping.channelName))).sort(),
      });
    }
  }

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
      setConfirmProductIds(null);
      router.refresh();
    });
  }

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">All channel stock is in sync</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            New order reservations, delivered orders, returns, invoices, and manual stock adjustments will appear here when mapped products need a channel stock push.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="grid gap-0 xl:grid-cols-[1fr_360px]">
            <div className="space-y-4 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Sparkles className="h-3 w-3" />
                      Review queue
                    </Badge>
                    {totalFailedMappings > 0 && (
                      <Badge variant="destructive">{totalFailedMappings} failed</Badge>
                    )}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold tracking-tight">Push only what needs attention</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {products.length} product{products.length === 1 ? "" : "s"} need stock review across {totalSupportedMappings} channel listing{totalSupportedMappings === 1 ? "" : "s"}.
                  </p>
                </div>
                <Button
                  onClick={() => requestPush(actionableProductIds)}
                  disabled={isPending || actionableProductIds.length === 0}
                  className="gap-2 lg:self-center"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
                  Push All Pending
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <CommandMetric icon={PackageCheck} label="Products" value={products.length} />
                <CommandMetric icon={Layers} label="Listings" value={totalPendingMappings} tone="amber" />
                <CommandMetric icon={ShieldCheck} label="Ready targets" value={totalSupportedMappings} tone="green" />
                <CommandMetric icon={AlertTriangle} label="Mismatches" value={totalMismatchMappings} tone={totalMismatchMappings > 0 ? "red" : "default"} />
              </div>
            </div>

            <div className="border-t bg-muted/20 p-5 xl:border-l xl:border-t-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Channel alignment</p>
                    <p className="text-xs text-muted-foreground">Cached channel stock compared with SeplorX available stock</p>
                  </div>
                  <span className="text-2xl font-semibold tabular-nums">{syncCoverage}%</span>
                </div>
                <Progress value={syncCoverage} className="h-2" />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border bg-background px-3 py-2">
                    <p className="text-muted-foreground">Different now</p>
                    <p className="mt-1 font-semibold tabular-nums">{totalMismatchMappings}</p>
                  </div>
                  <div className="rounded-md border bg-background px-3 py-2">
                    <p className="text-muted-foreground">Waiting push</p>
                    <p className="mt-1 font-semibold tabular-nums">{totalPendingMappings}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {totalFailedMappings > 0 && (
            <div className="border-t bg-red-50 px-5 py-3 text-sm text-red-700">
              {totalFailedMappings} mapping{totalFailedMappings === 1 ? "" : "s"} failed last push. Review the failure details if the same listings fail again.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                    <TabsTrigger value="failed">Failed</TabsTrigger>
                    <TabsTrigger value="mismatch">Mismatch</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-[280px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search product, SKU, channel..."
                      className="pl-9"
                    />
                  </div>
                  <Select value={channelFilter} onValueChange={setChannelFilter}>
                    <SelectTrigger className="min-w-[180px]">
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
            </CardContent>
          </Card>

          <div className="rounded-lg border bg-card">
            <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={allSelected || (someSelected ? "indeterminate" : false)}
                  onCheckedChange={toggleAll}
                  aria-label="Select all visible products"
                />
                <div>
                  <p className="text-sm font-semibold">Operations worklist</p>
                  <p className="text-xs text-muted-foreground">
                    {filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"} shown - {visibleMappingCount} listing{visibleMappingCount === 1 ? "" : "s"} affected
                  </p>
                </div>
              </div>
              <Badge variant={visibleMismatchMappings > 0 ? "secondary" : "outline"}>
                {visibleMismatchMappings} current mismatch{visibleMismatchMappings === 1 ? "" : "es"}
              </Badge>
            </div>

            <div className="divide-y">
              {filteredProducts.length === 0 && (
                <div className="px-4 py-14 text-center">
                  <p className="text-sm font-medium">No products match the current filters</p>
                  <p className="mt-1 text-sm text-muted-foreground">Clear the search or switch filters to see other stock sync items.</p>
                </div>
              )}

              {filteredProducts.map((product) => {
                const canPushProduct = product.mappingCount > 0;
                const isPushingProduct = pushingIds.has(product.id);
                const stockRange = getStockRangeLabel(product.channelStockMin, product.channelStockMax);
                const priority = getPriority(product);
                const impactText = getImpactText(product);
                const channelPreview = product.channelNames.slice(0, 2).join(", ");
                const hiddenChannelCount = Math.max(0, product.channelNames.length - 2);

                return (
                  <article
                    key={product.id}
                    className={cn(
                      "grid gap-4 px-4 py-4 transition-colors hover:bg-muted/20 lg:grid-cols-[32px_minmax(0,1fr)_280px]",
                      selectedProductIds.has(product.id) && "bg-blue-50/40",
                    )}
                  >
                    <div className="pt-1">
                      <Checkbox
                        checked={selectedProductIds.has(product.id)}
                        disabled={!canPushProduct}
                        onCheckedChange={(checked) => toggleProduct(product.id, checked === true)}
                        aria-label={`Select ${product.name}`}
                      />
                    </div>

                    <div className="min-w-0 space-y-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={cn("border", priority.className)}>
                              {priority.label}
                            </Badge>
                            {product.failedCount > 0 && <Badge variant="destructive">{product.failedCount} failed</Badge>}
                            {product.pendingCount > 0 && <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">{product.pendingCount} pending</Badge>}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Link href={`/products/${product.id}`} className="truncate text-base font-semibold text-primary hover:underline">
                              {product.name}
                            </Link>
                            <Link href={`/products/${product.id}`} className="text-muted-foreground hover:text-foreground" title="Open product">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{product.sku ?? "No SKU"}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openReview(product.id)}>
                            Review
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => requestPush([product.id], false)}
                            disabled={isPending || !canPushProduct}
                            className="gap-2"
                          >
                            {isPushingProduct ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
                            Push
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]">
                        <div className="rounded-lg border bg-background p-3">
                          <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                            <StockMetric label="On hand" value={product.quantityOnHand} />
                            <span className="text-muted-foreground">-</span>
                            <StockMetric label="Reserved" value={product.reservedQuantity} tone={product.reservedQuantity > 0 ? "amber" : undefined} />
                            <span className="text-muted-foreground">=</span>
                            <StockMetric label="Available" value={product.availableQuantity} tone={product.availableQuantity <= 0 ? "red" : "green"} emphasis />
                          </div>
                          <p className="mt-3 text-xs text-muted-foreground">
                            {product.lastTransactionAt ? (
                              <>
                                Last stock change {formatDateTime(product.lastTransactionAt)}
                                {product.lastTransactionNotes ? ` - ${product.lastTransactionNotes}` : ""}
                              </>
                            ) : (
                              "No recent stock transaction found"
                            )}
                          </p>
                        </div>

                        <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3">
                          <p className="text-xs font-medium text-blue-700">Stock push outcome</p>
                          <p className="mt-1 text-2xl font-semibold tabular-nums text-blue-950">
                            Set channels to {product.availableQuantity}
                          </p>
                          <p className="mt-1 text-xs text-blue-700">{impactText}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border bg-muted/20 p-3 lg:self-stretch">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Channel impact</p>
                      <div className="mt-3 space-y-3">
                        <ImpactRow label="Mapped" value={product.mappingCount} />
                        <ImpactRow label="Mismatch" value={product.mismatchCount} tone={product.mismatchCount > 0 ? "amber" : undefined} />
                        <ImpactRow label="Current stock" value={stockRange} />
                        <Separator />
                        <div>
                          <p className="text-xs text-muted-foreground">Channels</p>
                          <p className="mt-1 text-sm font-medium">
                            {channelPreview || "No channel"}
                            {hiddenChannelCount > 0 ? ` +${hiddenChannelCount}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="h-4 w-4" />
                Push plan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedProductIds.size === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Select products to build a push plan, or push all pending items from the command bar.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <PlanMetric label="Products" value={selectedProductIds.size} />
                    <PlanMetric label="Listings" value={selectedMappingCount} />
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Channels affected</p>
                    <p className="mt-1 text-sm">{selectedChannelNames.join(", ") || "No supported channel targets"}</p>
                  </div>
                  <Button
                    className="w-full gap-2"
                    disabled={isPending || selectedMappingCount === 0}
                    onClick={() => requestPush(Array.from(selectedProductIds))}
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
                    Push Selected
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setSelectedProductIds(new Set())}
                    disabled={isPending}
                  >
                    Clear selection
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-emerald-50 p-2 text-emerald-700">
                  <Clock3 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">What happens on push</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    SeplorX available stock is sent to every supported mapped listing. Successful mappings leave this queue; failed mappings stay visible with their error.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Sheet
        open={reviewProductId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReviewProductId(null);
            setReviewProduct(null);
          }
        }}
      >
        <SheetContent side="right" className="w-[680px] max-w-full overflow-y-auto sm:max-w-[720px]">
          {reviewLoading && (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {selectedProduct && !reviewLoading && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8 text-base leading-snug">{selectedProduct.name}</SheetTitle>
                <SheetDescription>
                  {selectedProduct.sku ?? "No SKU"} - push {selectedProduct.availableQuantity} available stock to {selectedProduct.mappingCount} mapped listing{selectedProduct.mappingCount === 1 ? "" : "s"}.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <div className="grid grid-cols-3 gap-2">
                  <StockMetric label="On hand" value={selectedProduct.quantityOnHand} />
                  <StockMetric label="Reserved" value={selectedProduct.reservedQuantity} tone={selectedProduct.reservedQuantity > 0 ? "amber" : undefined} />
                  <StockMetric label="Available" value={selectedProduct.availableQuantity} tone={selectedProduct.availableQuantity <= 0 ? "red" : "green"} emphasis />
                </div>

                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-3">
                  <div>
                    <p className="text-sm font-medium">Push this product</p>
                    <p className="text-xs text-muted-foreground">Updates every supported mapped listing for this SeplorX product.</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={isPending || selectedProduct.mappingCount === 0}
                    onClick={() => requestPush([selectedProduct.id], false)}
                    className="gap-2"
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" />
                    Push {selectedProduct.availableQuantity}
                  </Button>
                </div>

                <Tabs value={reviewTab} onValueChange={setReviewTab}>
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="mismatch">Mismatches</TabsTrigger>
                    <TabsTrigger value="failed">Failed</TabsTrigger>
                    <TabsTrigger value="unknown">Unknown stock</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="overflow-hidden rounded-lg border">
                  <div className="grid grid-cols-[1fr_110px_110px] gap-3 bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
                    <div>Channel listing</div>
                    <div className="text-right">SeplorX</div>
                    <div className="text-right">Channel</div>
                  </div>
                  <div className="divide-y">
                    {reviewMappings.length === 0 && (
                      <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                        No mappings match this review filter.
                      </div>
                    )}
                    {reviewMappings.map((mapping) => (
                      <div key={mapping.id} className="grid grid-cols-[1fr_110px_110px] gap-3 px-3 py-3 text-sm">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{mapping.channelName}</span>
                            <StatusBadge status={mapping.syncStatus} />
                            {!mapping.canPushStock && <Badge variant="outline">Unsupported</Badge>}
                          </div>
                          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{mapping.externalProductId}</p>
                          <p className="mt-0.5 truncate text-xs text-blue-600">{mapping.label ?? "View channel item"}</p>
                          {mapping.lastSyncError && <p className="mt-1 text-xs text-red-600">{mapping.lastSyncError}</p>}
                        </div>
                        <div className="text-right font-semibold tabular-nums">{selectedProduct.availableQuantity}</div>
                        <div className="text-right tabular-nums text-muted-foreground">{mapping.channelStock ?? "-"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

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

function StockMetric({
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
        ? "text-amber-700"
        : tone === "red"
          ? "text-red-700"
          : "text-foreground";

  return (
    <div className={cn("min-w-0", emphasis && "rounded-md bg-emerald-50 px-2 py-1")}>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("text-base font-semibold tabular-nums", toneClass)}>{value}</p>
    </div>
  );
}

function CommandMetric({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: "default" | "amber" | "green" | "red";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-700 bg-amber-50 border-amber-100"
      : tone === "green"
        ? "text-emerald-700 bg-emerald-50 border-emerald-100"
        : tone === "red"
          ? "text-red-700 bg-red-50 border-red-100"
          : "text-foreground bg-background border-border";

  return (
    <div className={cn("rounded-lg border px-3 py-3", toneClass)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium opacity-80">{label}</p>
        <Icon className="h-4 w-4 shrink-0 opacity-70" />
      </div>
      <p className="mt-2 text-2xl font-semibold leading-none tabular-nums">{value}</p>
    </div>
  );
}

function ImpactRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "amber" | "red";
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", tone === "amber" && "text-amber-700", tone === "red" && "text-red-700")}>
        {value}
      </span>
    </div>
  );
}

function PlanMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
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

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: string }) {
  const ui = STATUS_UI[status] ?? {
    label: status.replace(/_/g, " "),
    className: "bg-muted text-muted-foreground border-border",
  };

  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize", ui.className)}>
      {ui.label}
    </span>
  );
}

function getPriority(product: SyncProduct) {
  if (product.failedCount > 0) {
    return {
      label: "Fix first",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (product.mismatchCount > 0) {
    return {
      label: "Stock differs",
      className: "border-amber-200 bg-amber-50 text-amber-700",
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

function getImpactText(product: SyncProduct) {
  const listingText = `${product.mappingCount} listing${product.mappingCount === 1 ? "" : "s"}`;
  if (product.mismatchCount > 0) {
    return `${product.mismatchCount} of ${listingText} currently differ from SeplorX.`;
  }
  return `${listingText} will receive the same available quantity.`;
}

function getStockRangeLabel(min: number | null, max: number | null) {
  if (min === null || max === null) return "-";
  return min === max ? String(min) : `${min}-${max}`;
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
