"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileSpreadsheet,
  AlertCircle,
  ExternalLink,
  Trash2,
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
import { submitAmazonFeedUpdates, checkFeedStatus, deleteFeedRecord } from "./actions";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface FeedRow {
  id: number;
  feedId: string | null;
  feedType: string;
  category: string;
  status: string;
  productCount: number;
  errorCount: number | null;
  uploadUrl: string | null;
  resultDocumentUrl: string | null;
  errorMessage: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface FeedsDashboardProps {
  channelId: number;
  statusMap: Record<string, number>;
  feeds: FeedRow[];
}

// ────────────────────────────────────────────────────────────────────────────
// Status Config
// ────────────────────────────────────────────────────────────────────────────

const SYNC_STATUSES = [
  { key: "pending_update", label: "Pending", icon: Clock, color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  { key: "file_generating", label: "Generating", icon: FileSpreadsheet, color: "text-blue-600 bg-blue-50 border-blue-200" },
  { key: "uploading", label: "Uploading", icon: Upload, color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  { key: "processing", label: "Processing", icon: Loader2, color: "text-purple-600 bg-purple-50 border-purple-200" },
  { key: "failed", label: "Failed", icon: XCircle, color: "text-red-600 bg-red-50 border-red-200" },
  { key: "in_sync", label: "In Sync", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
] as const;

const FEED_STATUS_BADGES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  queued: { variant: "outline", label: "Queued" },
  generating: { variant: "outline", label: "Generating" },
  uploading: { variant: "outline", label: "Uploading" },
  in_progress: { variant: "secondary", label: "In Progress" },
  done: { variant: "default", label: "Done" },
  fatal: { variant: "destructive", label: "Failed" },
};

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function FeedsDashboard({ channelId, statusMap, feeds }: FeedsDashboardProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pollingId, setPollingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const pendingCount = statusMap["pending_update"] ?? 0;

  // ── Submit Pending Updates ──────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const result = await submitAmazonFeedUpdates(channelId);
      if ("error" in result) {
        toast.error("Failed to submit updates", { description: result.error });
      } else if (result.results && result.results.length > 0) {
        toast.success("Feed submitted", {
          description: `${result.results.length} category feed(s) uploaded to Amazon.`,
        });
        router.refresh();
      } else {
        toast.info("No pending updates", {
          description: result.message || "All products are already in sync.",
        });
      }
    } catch (err) {
      toast.error("Unexpected error", { description: String(err) });
    } finally {
      setIsSubmitting(false);
    }
  }, [channelId, router]);

  // ── Poll Feed Status ────────────────────────────────────────────────────
  const handlePollStatus = useCallback(async (feedRowId: number) => {
    setPollingId(feedRowId);
    try {
      const result = await checkFeedStatus(feedRowId);
      if ("error" in result) {
        toast.error("Failed to check status", { description: result.error });
      } else {
        toast.success("Status updated", {
          description: `Feed status: ${result.status}`,
        });
        router.refresh();
      }
    } catch (err) {
      toast.error("Unexpected error", { description: String(err) });
    } finally {
      setPollingId(null);
    }
  }, [router]);

  // ── Delete Feed Record ──────────────────────────────────────────────────
  const handleDelete = useCallback(async (feedRowId: number) => {
    if (!window.confirm("Are you sure you want to remove this feed record?")) return;
    setDeletingId(feedRowId);
    try {
      const result = await deleteFeedRecord(feedRowId);
      if ("error" in result) {
        toast.error("Failed to delete record", { description: result.error });
      } else {
        toast.success("Record removed");
        router.refresh();
      }
    } catch (err) {
      toast.error("Unexpected error", { description: String(err) });
    } finally {
      setDeletingId(null);
    }
  }, [router]);

  return (
    <>
      {/* ── Status Overview Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {SYNC_STATUSES.map(({ key, label, icon: Icon, color }) => {
          const count = statusMap[key] ?? 0;
          return (
            <div
              key={key}
              className={`rounded-xl border px-4 py-3 flex flex-col items-start gap-1 ${color}`}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
              </div>
              <span className="text-2xl font-bold tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>

      {/* ── Action Bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pendingCount > 0
            ? `${pendingCount} product(s) waiting to be pushed to Amazon.`
            : "All mapped products are in sync."}
        </p>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || pendingCount === 0}
          className="gap-2"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Process Pending Updates
        </Button>
      </div>

      {/* ── Feed History Table ──────────────────────────────────────────────── */}
      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Feed ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead className="text-right">Submitted</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feeds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <FileSpreadsheet className="h-8 w-8 text-muted-foreground/40" />
                      <span>No feed uploads yet. Update a product and click &quot;Process Pending Updates&quot;.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                feeds.map((feed) => {
                  const badgeConfig = FEED_STATUS_BADGES[feed.status] ?? { variant: "outline" as const, label: feed.status };
                  const isPolling = pollingId === feed.id;

                  return (
                    <TableRow key={feed.id}>
                      <TableCell className="capitalize font-medium">{feed.category}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {feed.feedId || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badgeConfig.variant}>{badgeConfig.label}</Badge>
                        {feed.errorMessage && (
                          <div className="flex items-start gap-1 mt-1">
                            <AlertCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                            <span className="text-xs text-red-600 line-clamp-2">{feed.errorMessage}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{feed.productCount}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {feed.createdAt ? (
                          <div className="flex flex-col items-end">
                            <span className="text-[14px] font-medium text-foreground">
                              {new Date(feed.createdAt).toISOString().slice(0, 10)}
                            </span>
                            <span className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                              {new Date(feed.createdAt).toISOString().slice(11, 19)} UTC
                            </span>
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {(feed.status === "in_progress" || feed.status === "uploading") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handlePollStatus(feed.id)}
                              disabled={isPolling}
                              title="Check status"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${isPolling ? "animate-spin" : ""}`} />
                            </Button>
                          )}
                          {feed.resultDocumentUrl && (
                            <a
                              href={feed.resultDocumentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Download processing report"
                            >
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                          {(feed.status === "fatal" || feed.status === "done") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                              onClick={() => handleDelete(feed.id)}
                              disabled={deletingId === feed.id}
                              title="Delete record"
                            >
                              {deletingId === feed.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
