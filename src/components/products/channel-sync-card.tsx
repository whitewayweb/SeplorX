"use client";

import { useActionState, useTransition } from "react";
import Image from "next/image";
import { Plug, ArrowUpFromLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveChannelMapping,
  deleteChannelMapping,
  pushProductStockToChannels,
} from "@/app/products/actions";
import { getChannelById } from "@/lib/channels/registry";

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
}

// ─── Add Mapping Form (one instance per channel) ──────────────────────────────

function AddMappingForm({
  productId,
  channelId,
}: {
  productId: number;
  channelId: number;
}) {
  const [state, action, pending] = useActionState(saveChannelMapping, null);

  return (
    <div className="space-y-1.5">
      <form action={action} className="flex gap-2 items-end">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="channelId" value={channelId} />
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">WC Product ID</Label>
          <Input
            name="externalProductId"
            placeholder="e.g. 123"
            className="h-8 text-sm"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">
            Label{" "}
            <span className="text-muted-foreground/60">(optional)</span>
          </Label>
          <Input
            name="label"
            placeholder="e.g. Series A"
            className="h-8 text-sm"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending} className="h-8">
          {pending ? "Saving…" : "Add"}
        </Button>
      </form>
      {state?.error && (
        <p className="text-destructive text-xs">{state.error}</p>
      )}
    </div>
  );
}

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
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          title="Remove mapping"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </form>
      {state?.error && (
        <p className="text-destructive text-xs">{state.error}</p>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Channel Sync
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No connected channels.{" "}
            <a
              href="/channels"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Connect a channel
            </a>{" "}
            to sync stock.
          </p>
        </CardContent>
      </Card>
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
        toast.success(
          `Stock pushed to ${ok.length} product${ok.length !== 1 ? "s" : ""}`,
        );
      } else {
        toast.warning(`${ok.length} succeeded, ${failed.length} failed`, {
          description: failed
            .map(
              (r) =>
                `${r.channelName} / ${r.label ?? r.externalProductId}: ${r.error}`,
            )
            .join("; "),
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Plug className="h-4 w-4" />
          Channel Sync
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePushStock}
          disabled={pushing || mappings.length === 0}
          title={
            mappings.length === 0
              ? "Add at least one channel mapping first"
              : undefined
          }
        >
          <ArrowUpFromLine className="h-3 w-3 mr-1.5" />
          {pushing ? "Pushing…" : "Push Stock to All Channels"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {connectedChannels.map((channel, idx) => {
          const channelMappings = mappings.filter(
            (m) => m.channelId === channel.id,
          );
          const definition = getChannelById(
            channel.channelType as Parameters<typeof getChannelById>[0],
          );

          return (
            <div
              key={channel.id}
              className={
                idx < connectedChannels.length - 1
                  ? "pb-6 border-b space-y-3"
                  : "space-y-3"
              }
            >
              {/* Channel header */}
              <div className="flex items-center gap-2">
                {definition?.icon ? (
                  <Image
                    src={definition.icon}
                    alt={definition.name}
                    width={16}
                    height={16}
                    className="shrink-0"
                  />
                ) : (
                  <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <p className="text-sm font-medium">{channel.name}</p>
                {channelMappings.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    · {channelMappings.length} mapping
                    {channelMappings.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Existing mappings */}
              {channelMappings.length > 0 && (
                <div className="rounded-md border divide-y">
                  {channelMappings.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">
                          {m.externalProductId}
                        </span>
                        {m.label && (
                          <span className="text-xs text-muted-foreground">
                            {m.label}
                          </span>
                        )}
                      </div>
                      <RemoveMappingButton mappingId={m.id} />
                    </div>
                  ))}
                </div>
              )}

              {/* Add mapping form */}
              <AddMappingForm productId={productId} channelId={channel.id} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
