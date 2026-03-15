"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  AlertCircle,
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
import { pushChannelProductUpdates } from "@/app/(dashboard)/channels/[id]/sync/actions";

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
  pendingProducts: { externalProductId: string; name: string | null }[];
}

// ────────────────────────────────────────────────────────────────────────────
// Status config
// ────────────────────────────────────────────────────────────────────────────

const STATUS_CARDS = [
  { key: "pending_update", label: "Pending",  icon: Clock,         color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  { key: "failed",         label: "Failed",   icon: XCircle,       color: "text-red-600 bg-red-50 border-red-200" },
  { key: "in_sync",        label: "In Sync",  icon: CheckCircle2,  color: "text-green-600 bg-green-50 border-green-200" },
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
        toast.error("Sync failed", { description: result.error });
        return;
      }

      if (result.pushed === 0 && result.failed === 0) {
        toast.info("Nothing to sync", { description: "All products are already in sync." });
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
        toast.success("Sync complete", {
          description: `${result.pushed} product(s) pushed to ${channelName} successfully.`,
        });
      } else {
        toast.warning("Sync completed with errors", {
          description: `${result.pushed} pushed, ${result.failed} failed. See results below.`,
        });
      }

      router.refresh();
    } catch (err) {
      toast.error("Unexpected error", { description: String(err) });
    } finally {
      setIsSyncing(false);
    }
  }, [channelId, channelName, pendingProducts, router]);

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
            ? `${pendingCount} product(s) waiting to be pushed to ${channelName}.`
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
          {isSyncing ? "Syncing…" : "Push Updates to Store"}
        </Button>
      </div>

      {/* ── Pending / Result Table ───────────────────────────────────────── */}
      {(syncResults !== null || pendingProducts.length > 0) && (
        <div className="rounded-md border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>External ID</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncResults !== null ? (
                  syncResults.map((row) => (
                    <TableRow key={row.externalProductId}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.externalProductId}
                      </TableCell>
                      <TableCell className="font-medium">{row.name ?? "—"}</TableCell>
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
                        {row.error ? (
                          <div className="flex items-start gap-1">
                            <AlertCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                            <span className="text-xs text-red-600">{row.error}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  pendingProducts.map((p) => (
                    <TableRow key={p.externalProductId}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.externalProductId}
                      </TableCell>
                      <TableCell className="font-medium">{p.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200">
                          <Clock className="h-3 w-3 mr-1" /> Pending
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">Awaiting sync</span>
                      </TableCell>
                    </TableRow>
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
