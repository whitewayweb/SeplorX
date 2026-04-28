"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpFromLine, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { pushSelectedProductStock } from "./actions";

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
  lastTransactionAt: Date | string | null;
  lastTransactionNotes: string | null;
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
  const [isPending, startTransition] = useTransition();

  const actionableProductIds = useMemo(
    () => products.filter((p) => p.mappings.some((m) => m.canPushStock)).map((p) => p.id),
    [products],
  );

  const allSelected = actionableProductIds.length > 0 && actionableProductIds.every((id) => selectedProductIds.has(id));
  const someSelected = selectedProductIds.size > 0 && !allSelected;

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
      router.refresh();
    });
  }

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <ArrowUpFromLine className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">All channel stock is in sync</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            New order reservations, delivered orders, returns, invoices, and manual stock adjustments will appear here when mapped products need a channel stock push.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Products Requiring Stock Push</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {products.length} product{products.length === 1 ? "" : "s"} have channel mappings that are not in sync.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedProductIds.size > 0 && (
              <Button
                variant="outline"
                onClick={() => pushProducts(Array.from(selectedProductIds))}
                disabled={isPending}
                className="gap-2"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
                Push Selected ({selectedProductIds.size})
              </Button>
            )}
            <Button
              onClick={() => pushProducts(actionableProductIds)}
              disabled={isPending || actionableProductIds.length === 0}
              className="gap-2"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
              Push All Pending Stock
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <div className="min-w-[980px]">
        <div className="grid grid-cols-[44px_minmax(320px,1.4fr)_minmax(260px,1fr)_160px] gap-4 px-4 py-3 border-b bg-muted/40 text-xs font-semibold text-muted-foreground">
          <div>
            <Checkbox
              checked={allSelected || (someSelected ? "indeterminate" : false)}
              onCheckedChange={toggleAll}
              aria-label="Select all products"
            />
          </div>
          <div>SeplorX Product</div>
          <div>Channel Mappings</div>
          <div className="text-right">Action</div>
        </div>

        <div className="divide-y">
          {products.map((product) => {
            const canPushProduct = product.mappings.some((m) => m.canPushStock);
            const isPushingProduct = pushingIds.has(product.id);
            const pendingCount = product.mappings.filter((m) => m.syncStatus === "pending_update").length;
            const failedCount = product.mappings.filter((m) => m.syncStatus === "failed").length;

            return (
              <div key={product.id} className="grid grid-cols-[44px_minmax(320px,1.4fr)_minmax(260px,1fr)_160px] gap-4 px-4 py-4">
                <div className="pt-1">
                  <Checkbox
                    checked={selectedProductIds.has(product.id)}
                    disabled={!canPushProduct}
                    onCheckedChange={(checked) => toggleProduct(product.id, checked === true)}
                    aria-label={`Select ${product.name}`}
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/products/${product.id}`} className="font-medium text-primary hover:underline">
                        {product.name}
                      </Link>
                      <Link href={`/products/${product.id}`} className="text-muted-foreground hover:text-foreground" title="Open product">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{product.sku ?? "No SKU"}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 max-w-md">
                    <StockMetric label="On hand" value={product.quantityOnHand} />
                    <StockMetric label="Reserved" value={product.reservedQuantity} tone={product.reservedQuantity > 0 ? "amber" : undefined} />
                    <StockMetric label="Available" value={product.availableQuantity} tone={product.availableQuantity <= 0 ? "red" : "green"} />
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {product.lastTransactionAt ? (
                      <>
                        Last change: {new Date(product.lastTransactionAt).toLocaleString()}
                        {product.lastTransactionNotes ? ` · ${product.lastTransactionNotes}` : ""}
                      </>
                    ) : (
                      "No recent stock transaction found"
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline">{product.mappings.length} mapped</Badge>
                    {pendingCount > 0 && <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">{pendingCount} pending</Badge>}
                    {failedCount > 0 && <Badge variant="destructive">{failedCount} failed</Badge>}
                  </div>

                  <div className="rounded-md border overflow-hidden">
                    {product.mappings.map((mapping) => (
                      <div key={mapping.id} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 border-b last:border-b-0 text-xs">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{mapping.channelName}</span>
                            <StatusBadge status={mapping.syncStatus} />
                            {!mapping.canPushStock && <Badge variant="outline">Unsupported</Badge>}
                          </div>
                          <p className="font-mono text-muted-foreground mt-1 truncate">
                            {mapping.externalProductId}
                          </p>
                          <p className="text-blue-600 mt-0.5 truncate">
                            {mapping.label ?? "View channel item"}
                          </p>
                          {mapping.lastSyncError && (
                            <p className="text-red-600 mt-1 line-clamp-2">{mapping.lastSyncError}</p>
                          )}
                        </div>
                        <div className="text-right whitespace-nowrap">
                          <p className="font-semibold tabular-nums">{product.availableQuantity}</p>
                          <p className="text-muted-foreground tabular-nums">
                            channel {mapping.channelStock ?? "—"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end items-start">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pushProducts([product.id])}
                    disabled={isPending || !canPushProduct}
                    className="gap-2"
                  >
                    {isPushingProduct ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
                    Push
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}

function StockMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber" | "red";
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
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const ui = STATUS_UI[status] ?? {
    label: status.replace(/_/g, " "),
    className: "bg-muted text-muted-foreground border-border",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize ${ui.className}`}>
      {ui.label}
    </span>
  );
}
