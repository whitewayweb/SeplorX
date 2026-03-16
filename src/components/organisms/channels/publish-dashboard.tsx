"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pushChannelProductUpdates } from "@/app/(dashboard)/channels/[id]/publish/actions";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Clock, Upload, ArrowRight } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface StagedChange {
  id: number;
  externalProductId: string;
  delta: Record<string, unknown>;
  createdAt: Date;
  productName: string | null;
}

interface ChannelPublishDashboardProps {
  channelId: number;
  channelName: string;
  pendingCount: number;
  failedCount: number;
  inSyncCount: number;
  stagedChanges: StagedChange[];
}

// ── Human-friendly field labels ─────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  name: "Product Name",
  sku: "SKU",
  description: "Description",
  short_description: "Short Description",
  regular_price: "Price",
  price: "Price",
  weight: "Weight",
  stockQuantity: "Stock Quantity",
  "item-condition": "Condition",
};

function humanFieldName(key: string): string {
  return FIELD_LABELS[key] || key.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Component ───────────────────────────────────────────────────────────────

export function ChannelPublishDashboard({
  channelId,
  channelName,
  pendingCount,
  failedCount,
  inSyncCount,
  stagedChanges,
}: ChannelPublishDashboardProps) {
  const [isPushing, startTransition] = useTransition();
  const [pushResult, setPushResult] = useState<{
    pushed: number;
    failed: number;
  } | null>(null);

  function handlePublish() {
    startTransition(async () => {
      const result = await pushChannelProductUpdates(channelId);
      if ("success" in result && result.success) {
        setPushResult({ pushed: result.pushed ?? 0, failed: result.failed ?? 0 });
        toast.success("Updates published", {
          description: `${result.pushed} product(s) synced to ${channelName}.`,
        });
      } else {
        toast.error("Publish failed", { description: result.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Status Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Sync</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inSyncCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{failedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Push Result ─────────────────────────────────────────────── */}
      {pushResult && (
        <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm">
              Published <strong>{pushResult.pushed}</strong> product(s).
              {pushResult.failed > 0 && (
                <span className="text-red-600 ml-1">{pushResult.failed} failed.</span>
              )}
            </span>
          </CardContent>
        </Card>
      )}

      {/* ── Staged Changes ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Staged Changes</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {stagedChanges.length > 0
                ? `${stagedChanges.length} product(s) ready to publish.`
                : "No staged changes to publish."}
            </p>
          </div>
          {stagedChanges.length > 0 && (
            <Button onClick={handlePublish} disabled={isPushing} className="gap-2">
              <Upload className="h-4 w-4" />
              {isPushing ? "Publishing..." : `Publish ${stagedChanges.length} Product(s)`}
            </Button>
          )}
        </CardHeader>

        {stagedChanges.length > 0 && (
          <CardContent className="space-y-4 pt-0">
            {stagedChanges.map((change) => (
              <div
                key={change.id}
                className="rounded-lg border p-4 space-y-3"
              >
                {/* Product header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {change.productName || "Unknown Product"}
                    </span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {change.externalProductId}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                    Last edited: {new Date(change.createdAt).toLocaleString()}
                  </span>
                </div>

                {/* Delta fields */}
                <div className="rounded-md bg-muted/50 divide-y text-sm">
                  {Object.entries(change.delta as Record<string, unknown>).map(([field, newValue]) => (
                    <div key={field} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-muted-foreground min-w-[140px] font-medium">
                        {humanFieldName(field)}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-mono text-xs truncate">
                        {typeof newValue === "object" ? JSON.stringify(newValue) : String(newValue ?? "")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
