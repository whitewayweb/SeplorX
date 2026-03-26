"use client";

import { useActionState, useTransition } from "react";
import Image from "next/image";
import { Plug, ArrowUpFromLine, Trash2, Link2Off } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteChannelMapping,
  pushProductStockToChannels,
} from "@/app/(dashboard)/products/actions";
import { getChannelById } from "@/lib/channels/registry";
import Link from "next/link";
import { AddMappingDialog } from "./add-mapping-dialog";

interface ConnectedChannel {
  id: number;
  channelType: string;
  name: string;
}

interface MappingRow {
  id: number;
  channelId: number;
  externalProductId: string;
  label: string | null;
  syncStatus: string;
  channelStock: number | null;
}

// ─── Status Config ─────────────────────────────────────────────────────────────

const SYNC_STATUS_UI: Record<string, { label: string; className: string }> = {
  pending_update: {
    label: "Pending",
    className: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800/40",
  },
  file_generating: {
    label: "Generating",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40",
  },
  uploading: {
    label: "Uploading",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/40",
  },
  processing: {
    label: "Processing",
    className: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/40",
  },
  failed: {
    label: "Failed",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/40",
  },
};

// ─── Remove Mapping Button ────────────────────────────────────────────────────

function RemoveMappingButton({ mappingId }: { mappingId: number }) {
  const [state, action, pending] = useActionState(deleteChannelMapping, null);

  return (
    <div>
      <form action={action}>
        <input type="hidden" name="id" value={mappingId} />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          disabled={pending}
          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
          title="Remove mapping"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </form>
      {state?.error && (
        <p className="text-rose-600 text-xs mt-1">{state.error}</p>
      )}
    </div>
  );
}

// ─── Main Card ────────────────────────────────────────────────────────────────

export interface ChannelSyncCardProps {
  productId: number;
  connectedChannels: ConnectedChannel[];
  mappings: MappingRow[];
}

export function ChannelSyncCard({
  productId,
  connectedChannels,
  mappings,
}: ChannelSyncCardProps) {
  const [pushing, startPush] = useTransition();

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
      if ("error" in result) {
        toast.error(result.error ?? "Failed to push stock");
        return;
      }
      const { results } = result;
      if (results.length === 0) {
        toast.info("No channel mappings configured for this product");
        return;
      }
      const ok = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
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
            · {mappings.length} mapping{mappings.length !== 1 ? "s" : ""}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePushStock}
          disabled={pushing || mappings.length === 0}
          title={mappings.length === 0 ? "Add at least one channel mapping first" : undefined}
          className="h-8 text-xs gap-1.5 rounded-lg"
        >
          <ArrowUpFromLine className="h-3 w-3" />
          {pushing ? "Pushing…" : "Push Stock"}
        </Button>
      </div>

      {/* Channel List */}
      <div className="divide-y divide-border/40">
        {connectedChannels.map((channel) => {
          const channelMappings = mappings.filter((m) => m.channelId === channel.id);
          const definition = getChannelById(
            channel.channelType as Parameters<typeof getChannelById>[0],
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
                  {channelMappings.length > 0 && (
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary">
                      {channelMappings.length}
                    </span>
                  )}
                </div>
                <AddMappingDialog
                  productId={productId}
                  channelId={channel.id}
                  channelName={channel.name}
                />
              </div>

              {/* Mappings */}
              {channelMappings.length > 0 && (
                <div className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border/40 bg-muted/30">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">External ID</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Product</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Stock</th>
                          <th className="w-[40px] px-2 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {channelMappings.map((m) => (
                          <tr
                            key={m.id}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-4 py-2 w-1 whitespace-nowrap">
                              <span className="font-mono text-xs bg-muted/60 rounded px-1.5 py-0.5">
                                {m.externalProductId}
                              </span>
                            </td>
                            <td className="px-4 py-2 w-1/2">
                              {m.label ? (
                                <Link href={`/products/channels/${m.channelId}?q=${encodeURIComponent(m.externalProductId)}`} className="text-xs text-blue-600 hover:text-blue-800 hover:underline max-w-[300px]" title="View in Channels">
                                  {m.label}
                                </Link>
                              ) : (
                                <Link href={`/products/channels/${m.channelId}?q=${encodeURIComponent(m.externalProductId)}`} className="text-xs text-blue-600 hover:text-blue-800 hover:underline italic" title="View in Channels">
                                  View Item
                                </Link>
                              )}
                            </td>
                            <td className="px-4 py-2 w-1 whitespace-nowrap">
                              {SYNC_STATUS_UI[m.syncStatus] && (
                                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium border ${SYNC_STATUS_UI[m.syncStatus].className}`}>
                                  {SYNC_STATUS_UI[m.syncStatus].label}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 w-1 text-right whitespace-nowrap">
                              {m.channelStock !== null ? (
                                <span className="text-xs font-medium tabular-nums">{m.channelStock}</span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/50 italic">N/A</span>
                              )}
                            </td>
                            <td className="px-2 py-2 w-[40px] text-right">
                              <RemoveMappingButton mappingId={m.id} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
