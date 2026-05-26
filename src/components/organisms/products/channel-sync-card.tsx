"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Plug, ArrowUpFromLine, Link2Off } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  pushProductStockToChannels,
} from "@/app/(dashboard)/products/actions";
import {
  approvePendingChannelMappingItem,
  dismissPendingChannelMappingItem,
} from "@/app/(dashboard)/agents/actions";
import { getChannelById } from "@/lib/channels/registry";
import Link from "next/link";
import { AddMappingDialog } from "./add-mapping-dialog";
import type { PendingMappingInteraction } from "@/data/agents";
import type { ProductMappingSummary } from "@/data/products";
import { ChannelSyncSheet } from "./channel-sync-sheet";

interface ConnectedChannel {
  id: number;
  channelType: string;
  name: string;
}



// ─── Pending AI Mapping Buttons ───────────────────────────────────────────────

function PendingMappingActionButtons({
  mapping,
  productId,
}: {
  mapping: PendingMappingInteraction;
  productId: number;
}) {
  const [isPending, startTransition] = useTransition();

  function onApprove() {
    startTransition(async () => {
      const result = await approvePendingChannelMappingItem(
        mapping.taskId,
        mapping.channelId,
        productId,
        mapping.externalProductId,
        mapping.externalProductName
      );
      if (result.error) toast.error(result.error);
      else toast.success(`Approved mapping for ${mapping.externalProductId}`);
    });
  }

  function onDismiss() {
    startTransition(async () => {
      const result = await dismissPendingChannelMappingItem(
        mapping.taskId,
        mapping.externalProductId
      );
      if (result.error) toast.error(result.error);
      else toast.success(`Dismissed mapping proposal`);
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={onDismiss}
        className="h-7 text-xs px-2 text-muted-foreground hover:bg-muted"
      >
        Dismiss
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={onApprove}
        className="h-7 text-xs px-2.5 bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:hover:bg-orange-900"
      >
        Approve
      </Button>
    </div>
  );
}

// ─── Main Card ────────────────────────────────────────────────────────────────

export interface ChannelSyncCardProps {
  productId: number;
  connectedChannels: ConnectedChannel[];
  mappingsSummary: ProductMappingSummary[];
  pendingMappings?: PendingMappingInteraction[];
  availableStock: number;
}

export function ChannelSyncCard({
  productId,
  connectedChannels,
  mappingsSummary,
  pendingMappings = [],
  availableStock,
}: ChannelSyncCardProps) {
  const router = useRouter();
  const [pushing, startPush] = useTransition();
  const [activeSheetChannel, setActiveSheetChannel] = useState<number | null>(null);

  const totalMappings = mappingsSummary.reduce((acc, sum) => acc + sum.totalCount, 0);
  const totalPending = mappingsSummary.reduce((acc, sum) => acc + sum.pendingCount, 0);
  const totalFailed = mappingsSummary.reduce((acc, sum) => acc + sum.failedCount, 0);

  if (connectedChannels.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center gap-2">
          <Plug className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Channel Sync</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center">
            <Link2Off className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">No connected channels</p>
            <Link
              href="/channels"
              prefetch={false}
              className="text-sm text-primary hover:underline underline-offset-2 mt-0.5 inline-block"
            >
              Connect a channel →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  function handlePushStock() {
    startPush(async () => {
      const result = await pushProductStockToChannels(productId);
      if (!result.success) {
        toast.error(result.error ?? "Failed to push stock");
        return;
      }
      const { results } = result;
      if (results.length === 0) {
        toast.info("No channel mappings configured for this product");
        return;
      }
      const ok = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok && !r.skipped);
      if (failed.length === 0) {
        toast.success(`Stock pushed to ${ok.length} product${ok.length !== 1 ? "s" : ""}`);
      } else {
        toast.warning(`${ok.length} succeeded, ${failed.length} failed`, {
          description: failed
            .map((r) => `${r.channelName} / ${r.label ?? r.externalProductId}: ${r.error}`)
            .join("; "),
        });
      }
    });
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Channel Sync</h2>
          <span className="text-xs text-muted-foreground">
            · {totalMappings} mapping{totalMappings !== 1 ? "s" : ""}
          </span>
          {totalPending > 0 && (
            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border bg-yellow-50 text-yellow-700 border-yellow-200">
              {totalPending} pending sync
            </span>
          )}
          {totalFailed > 0 && (
            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border bg-red-50 text-red-700 border-red-200">
              {totalFailed} failed
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePushStock}
          disabled={pushing || totalMappings === 0}
          title={totalMappings === 0 ? "Add at least one channel mapping first" : undefined}
          className="h-8 text-xs gap-1.5 rounded-lg"
        >
          <ArrowUpFromLine className="h-3 w-3" />
          {pushing ? "Pushing…" : "Push Stock All"}
        </Button>
      </div>

      {/* Channel List */}
      <div className="divide-y divide-border/40">
        {connectedChannels.map((channel) => {
          const summary = mappingsSummary.find((m) => m.channelId === channel.id);
          const count = summary?.totalCount || 0;
          const pendingCount = summary?.pendingCount || 0;
          const failedCount = summary?.failedCount || 0;

          const channelPendingAI = pendingMappings.filter((p) => p.channelId === channel.id);
          const definition = getChannelById(
            channel.channelType as Parameters<typeof getChannelById>[0]
          );

          return (
            <div key={channel.id} className="px-5 py-4 space-y-3">
              {/* Channel name row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {definition?.icon ? (
                    <Image
                      src={definition.icon}
                      alt={definition.name}
                      width={16}
                      height={16}
                      className="shrink-0 rounded-sm"
                      unoptimized
                    />
                  ) : (
                    <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{channel.name}</span>
                  {count > 0 && (
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary">
                      {count} {count === 1 ? 'Mapping' : 'Mappings'}
                    </span>
                  )}
                  {pendingCount > 0 && (
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
                      {pendingCount} Pending Sync
                    </span>
                  )}
                  {failedCount > 0 && (
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
                      {failedCount} Failed
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {count > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 text-xs" 
                      onClick={() => setActiveSheetChannel(channel.id)}
                    >
                      Manage Mappings
                    </Button>
                  )}
                  <AddMappingDialog
                    productId={productId}
                    channelId={channel.id}
                    channelName={channel.name}
                  />
                </div>
              </div>

              {/* Pending Approvals Table */}
              {channelPendingAI.length > 0 && (
                <div className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border/40 bg-muted/30">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">External ID</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Product</th>
                          <th className="w-[120px] px-2 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {channelPendingAI.map((p) => (
                          <tr
                            key={`pending-${p.taskId}-${p.externalProductId}`}
                            className="bg-orange-50/40 hover:bg-orange-50/80 dark:bg-orange-950/20 dark:hover:bg-orange-900/20 transition-colors"
                          >
                            <td className="px-4 py-2.5 w-1 whitespace-nowrap">
                              <span className="font-mono text-xs bg-orange-200/50 dark:bg-orange-900/40 text-orange-800 dark:text-orange-400 rounded px-1.5 py-0.5">
                                {p.externalProductId}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 w-1/2">
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-medium text-orange-900 dark:text-orange-300" title={p.externalProductName}>
                                  {p.externalProductName}
                                </span>
                                {p.externalSku && (
                                  <span className="text-[10px] text-orange-700/70 dark:text-orange-500/70 font-mono mt-0.5">
                                    SKU: {p.externalSku}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2.5 w-[120px] whitespace-nowrap text-right align-middle">
                              <PendingMappingActionButtons mapping={p} productId={productId} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Side Sheet For Mappings */}
              {activeSheetChannel === channel.id && (
                <ChannelSyncSheet
                  isOpen={true}
                  onOpenChange={(open) => {
                    if (!open) setActiveSheetChannel(null);
                  }}
                  productId={productId}
                  channelId={channel.id}
                  channelName={channel.name}
                  availableStock={availableStock}
                  onUpdate={() => {
                    router.refresh();
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
