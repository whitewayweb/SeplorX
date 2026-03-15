"use client";

import { useState, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  AlertCircle,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { pushChannelProductUpdates } from "@/app/(dashboard)/channels/[id]/publish/actions";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface SyncResultRow {
  externalProductId: string;
  name: string | null;
  success: boolean | null;
  error: string | null;
}

export interface ChannelSyncDashboardProps {
  channelId: number;
  channelName: string;
  pendingCount: number;
  failedCount: number;
  inSyncCount: number;
  pendingProducts: {
    externalProductId: string;
    name: string | null;
    sku: string | null;
    rawData: any;
  }[];
}

// ────────────────────────────────────────────────────────────────────────────
// Status config
// ────────────────────────────────────────────────────────────────────────────

const STATUS_CARDS = [
  { key: "pending_update", label: "Pending", icon: Clock, color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  { key: "failed", label: "Failed", icon: XCircle, color: "text-red-600 bg-red-50 border-red-200" },
  { key: "in_sync", label: "In Sync", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Component — fully channel-agnostic
// ────────────────────────────────────────────────────────────────────────────

export function ChannelSyncDashboard({
  channelId,
  channelName,
  pendingCount,
  failedCount,
  inSyncCount,
  pendingProducts,
}: ChannelSyncDashboardProps) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResultRow[] | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedRows(newSet);
  };

  const countMap: Record<string, number> = {
    pending_update: pendingCount,
    failed: failedCount,
    in_sync: inSyncCount,
  };

  // ── Sync handler ─────────────────────────────────────────────────────────
  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncResults(null);
    try {
      const result = await pushChannelProductUpdates(channelId);

      if ("error" in result) {
        toast.error("Publish failed", { description: result.error });
        return;
      }

      if (result.pushed === 0 && result.failed === 0) {
        toast.info("Nothing to publish", { description: "All products are already in sync." });
        return;
      }

      const enriched: SyncResultRow[] = (result.results ?? []).map((r) => ({
        externalProductId: r.externalProductId,
        name: pendingProducts.find((p) => p.externalProductId === r.externalProductId)?.name ?? null,
        success: r.success,
        error: r.error ?? null,
      }));
      setSyncResults(enriched);

      if (result.failed === 0) {
        toast.success("Publish complete", {
          description: `${result.pushed} product(s) published to ${channelName} successfully.`,
        });
      } else {
        toast.warning("Publish completed with errors", {
          description: `${result.pushed} published, ${result.failed} failed. See results below.`,
        });
      }

      router.refresh();
    } catch (err) {
      toast.error("Unexpected error", { description: String(err) });
    } finally {
      setIsSyncing(false);
    }
  }, [channelId, channelName, pendingProducts, router]);

  const renderProductChanges = (product: any) => {
    const rawData = product.rawData || {};
    const relevantFields = [
      { label: "Price", value: rawData.regular_price || rawData.price },
      { label: "SKU", value: product.sku },
      { label: "Description", value: rawData.description ? "Modified" : null },
      { label: "Weight", value: rawData.weight },
    ].filter(f => f.value !== null && f.value !== undefined);

    if (relevantFields.length === 0) return <span className="text-xs italic text-muted-foreground">General Metadata</span>;

    return (
      <div className="flex flex-wrap gap-2 mt-1">
        {relevantFields.map(f => (
          <Badge key={f.label} variant="outline" className="text-[10px] px-1.5 py-0 font-normal border-slate-200 bg-slate-50">
            <span className="font-semibold mr-1">{f.label}:</span> {f.value}
          </Badge>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* ── Status Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {STATUS_CARDS.map(({ key, label, icon: Icon, color }) => (
          <div
            key={key}
            className={`rounded-xl border px-4 py-3 flex flex-col items-start gap-1 ${color}`}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
            </div>
            <span className="text-2xl font-bold tabular-nums">{countMap[key] ?? 0}</span>
          </div>
        ))}
      </div>

      {/* ── Action Bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pendingCount > 0
            ? `${pendingCount} product(s) with local updates waiting to be pushed.`
            : `All mapped products are in sync with ${channelName}.`}
        </p>
        <Button
          onClick={handleSync}
          disabled={isSyncing || pendingCount === 0}
          className="gap-2"
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isSyncing ? "Publishing…" : "Publish Updates to Store"}
        </Button>
      </div>

      {/* ── Pending / Result Table ───────────────────────────────────────── */}
      {(syncResults !== null || pendingProducts.length > 0) && (
        <div className="rounded-md border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Staged Changes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncResults !== null ? (
                  syncResults.map((row) => (
                    <TableRow key={row.externalProductId} className="group">
                      <TableCell className="w-[40px]"></TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{row.name ?? "—"}</span>
                          <span className="text-[10px] font-mono text-muted-foreground uppercase">{row.externalProductId}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground italic">Update complete</span>
                      </TableCell>
                      <TableCell>
                        {row.success ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Pushed
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" /> Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                         {row.error && (
                            <div className="flex items-start gap-1 max-w-[200px]">
                              <AlertCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                              <span className="text-xs text-red-600 truncate" title={row.error}>{row.error}</span>
                            </div>
                         )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  pendingProducts.map((p) => (
                    <Fragment key={p.externalProductId}>
                      <TableRow className="group border-b-0 hover:bg-slate-50/30">
                        <TableCell className="w-[40px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleRow(p.externalProductId)}
                          >
                            {expandedRows.has(p.externalProductId) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{p.name ?? "—"}</span>
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">{p.externalProductId}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {renderProductChanges(p)}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200">
                            <Clock className="h-3 w-3 mr-1" /> Pending
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => toggleRow(p.externalProductId)}>
                            <Eye className="h-3 w-3" /> Review
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandedRows.has(p.externalProductId) && (
                        <TableRow className="bg-slate-50/30 border-b">
                          <TableCell colSpan={5} className="py-3 px-12">
                            <div className="text-xs space-y-2 max-w-2xl">
                              <p className="font-semibold text-slate-600 mb-2 uppercase tracking-tight text-[10px]">Technical Payload Preview</p>
                              <pre className="bg-slate-900 text-slate-300 p-3 rounded-md overflow-x-auto font-mono text-[11px] leading-relaxed">
                                {(() => {
                                  const preview: any = {};
                                  if (p.name) preview.name = p.name;
                                  if (p.sku) preview.sku = p.sku;
                                  if (p.rawData?.description) preview.description = p.rawData.description;
                                  if (p.rawData?.regular_price || p.rawData?.price) {
                                    preview.regular_price = p.rawData.regular_price || p.rawData.price;
                                  }
                                  if (p.rawData?.weight) preview.weight = p.rawData.weight;
                                  return JSON.stringify(preview, null, 2);
                                })()}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {syncResults === null && pendingProducts.length === 0 && (
        <div className="rounded-md border bg-white shadow-sm">
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Upload className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm">No pending updates. Edit a product and save to queue a sync.</p>
          </div>
        </div>
      )}
    </>
  );
}
