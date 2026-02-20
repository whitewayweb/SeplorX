"use client";

import { useActionState, useTransition, useState } from "react";
import Image from "next/image";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChannelStatusBadge } from "./channel-status-badge";
import {
  disconnectChannel,
  deleteChannel,
  resetChannelStatus,
} from "@/app/channels/actions";
import { getChannelById } from "@/lib/channels/registry";
import type { ChannelInstance } from "@/lib/channels/types";

// ─── Reconnect button (for pending / disconnected OAuth channels) ─────────────

interface ReconnectButtonProps {
  channelId: number;
  storeUrl: string | null;
  label: string;
}

function ReconnectButton({ channelId, storeUrl, label }: ReconnectButtonProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleReconnect() {
    if (!storeUrl) {
      setError("No store URL saved. Remove this channel and add it again.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resetChannelStatus(channelId);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const params = new URLSearchParams({
        app_name: "SeplorX",
        scope: "read_write",
        user_id: String(channelId),
        return_url: `${appUrl}/channels`,
        callback_url: `${appUrl}/api/channels/woocommerce/callback`,
      });
      window.location.assign(`${storeUrl.replace(/\/$/, "")}/wc-auth/v1/authorize?${params}`);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {error && <span className="text-destructive text-xs">{error}</span>}
      <Button
        variant="outline"
        size="sm"
        onClick={handleReconnect}
        disabled={pending}
      >
        {pending ? "Connecting…" : label}
      </Button>
    </div>
  );
}

// ─── Row actions ──────────────────────────────────────────────────────────────

interface ChannelRowActionsProps {
  channel: ChannelInstance;
}

function ChannelRowActions({ channel }: ChannelRowActionsProps) {
  const [disconnectState, disconnectAction, disconnecting] = useActionState(
    disconnectChannel,
    null,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteChannel,
    null,
  );

  const definition = getChannelById(
    channel.channelType as Parameters<typeof getChannelById>[0],
  );
  const isOAuth = definition?.authType === "oauth";

  return (
    <div className="flex items-center gap-2">
      {disconnectState?.error && (
        <span className="text-destructive text-xs">{disconnectState.error}</span>
      )}
      {deleteState?.error && (
        <span className="text-destructive text-xs">{deleteState.error}</span>
      )}

      {/* Reconnect: pending = setup never finished, disconnected = was connected before */}
      {isOAuth && channel.status === "pending" && (
        <ReconnectButton
          channelId={channel.id}
          storeUrl={channel.storeUrl}
          label="Complete Setup"
        />
      )}
      {isOAuth && channel.status === "disconnected" && (
        <ReconnectButton
          channelId={channel.id}
          storeUrl={channel.storeUrl}
          label="Reconnect"
        />
      )}

      {/* Disconnect: only when connected */}
      {channel.status === "connected" && (
        <form action={disconnectAction}>
          <input type="hidden" name="id" value={channel.id} />
          <Button variant="outline" size="sm" disabled={disconnecting}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
        </form>
      )}

      <form action={deleteAction}>
        <input type="hidden" name="id" value={channel.id} />
        <Button variant="destructive" size="sm" disabled={deleting}>
          {deleting ? "Removing…" : "Remove"}
        </Button>
      </form>
    </div>
  );
}

// ─── Channel list ─────────────────────────────────────────────────────────────

interface ChannelListProps {
  channels: ChannelInstance[];
}

export function ChannelList({ channels }: ChannelListProps) {
  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Store className="text-muted-foreground mb-3 h-10 w-10" />
        <p className="text-muted-foreground text-sm">No channels connected yet.</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Click &ldquo;New Channel&rdquo; to connect your first store.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Channel</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Store URL</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[220px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {channels.map((channel) => {
            const definition = getChannelById(
              channel.channelType as Parameters<typeof getChannelById>[0],
            );
            return (
              <TableRow key={channel.id}>
                <TableCell className="font-medium">{channel.name}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {definition?.icon ? (
                      <Image
                        src={definition.icon}
                        alt={definition.name}
                        width={20}
                        height={20}
                        className="shrink-0"
                      />
                    ) : (
                      <Store className="text-muted-foreground h-4 w-4 shrink-0" />
                    )}
                    <span className="text-sm">
                      {definition?.name ?? channel.channelType}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground text-sm">
                    {channel.storeUrl ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <ChannelStatusBadge status={channel.status} />
                </TableCell>
                <TableCell>
                  <ChannelRowActions channel={channel} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
