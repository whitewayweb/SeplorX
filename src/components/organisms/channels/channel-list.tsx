"use client";

import { useActionState, useTransition, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Store, Webhook, PackageSearch, PlugZap } from "lucide-react";
import { toast } from "sonner";
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
  registerChannelWebhooks,
  syncChannelProducts,
} from "@/app/(dashboard)/channels/actions";
import { getChannelById } from "@/lib/channels/registry";
import type { ChannelInstance } from "@/lib/channels/types";
import { ChannelMappingTrigger } from "@/components/organisms/agents/channel-mapping-trigger";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { EditChannelDialog } from "./edit-channel-dialog";

// ─── Reconnect button (pending / disconnected OAuth channels) ─────────────────

interface ReconnectButtonProps {
  channelId: number;
  channelType: string;
  storeUrl: string | null;
  label: string;
}

function ReconnectButton({ channelId, channelType, storeUrl, label }: ReconnectButtonProps) {
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
      const definition = getChannelById(channelType as Parameters<typeof getChannelById>[0]);
      if (!definition?.buildConnectUrl) {
        setError("This channel type is not supported.");
        return;
      }
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin).replace(/\/$/, "");
      const connectUrl = definition.buildConnectUrl(channelId, { storeUrl }, appUrl);
      window.location.assign(connectUrl);
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

// ─── Register Webhooks button ─────────────────────────────────────────────────

function RegisterWebhooksButton({ channelId }: { channelId: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRegister() {
    setError(null);
    startTransition(async () => {
      const result = await registerChannelWebhooks(channelId);
      if (!result.success) {
        setError(result.error ?? "Failed to register webhooks.");
      } else {
        toast.success("Webhooks registered", {
          description: "The channel will now send order events to SeplorX.",
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {error && <span className="text-destructive text-xs">{error}</span>}
      <Button
        variant="outline"
        size="sm"
        onClick={handleRegister}
        disabled={pending}
        title="Register order webhooks on this WooCommerce store"
      >
        <Webhook className="h-3 w-3 mr-1" />
        {pending ? "Registering…" : "Register Webhooks"}
      </Button>
    </div>
  );
}

// ─── Reconnect button for API-key channels ────────────────────────────────────

function ReconnectApiKeyButton({
  channelId,
  channelType,
}: {
  channelId: number;
  channelType: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleReconnect() {
    setError(null);
    startTransition(async () => {
      const result = await resetChannelStatus(channelId);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      // Redirect to the new-channel dialog pre-filtered to this type so the
      // user can re-enter their API credentials.
      router.push(`/channels?reconnect=${channelId}&type=${channelType}`);
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
        <PlugZap className="h-3 w-3 mr-1" />
        {pending ? "Reconnecting…" : "Reconnect"}
      </Button>
    </div>
  );
}

// ─── Fetch Products button ────────────────────────────────────────────────────

function FetchProductsButton({ channelId }: { channelId: number }) {
  const [pending, startTransition] = useTransition();

  function handleFetch() {
    startTransition(async () => {
      const res = await syncChannelProducts(channelId);
      if (res.error) {
        toast.error("Fetch failed", { description: res.error });
      } else {
        toast.success("Products Synced", {
          description: `Successfully cached ${res.count} products from this channel.`,
        });
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleFetch}
      disabled={pending}
      title="Fetch products from this channel"
    >
      <PackageSearch className="h-3 w-3 mr-1" />
      {pending ? "Fetching…" : "Fetch Products"}
    </Button>
  );
}

// ─── Row actions ──────────────────────────────────────────────────────────────

function ChannelRowActions({ channel }: { channel: ChannelInstance }) {
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
    <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
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
          channelType={channel.channelType}
          storeUrl={channel.storeUrl}
          label="Complete Setup"
        />
      )}
      {isOAuth && channel.status === "disconnected" && (
        <ReconnectButton
          channelId={channel.id}
          channelType={channel.channelType}
          storeUrl={channel.storeUrl}
          label="Reconnect"
        />
      )}
      {!isOAuth && channel.status === "disconnected" && (
        <ReconnectApiKeyButton
          channelId={channel.id}
          channelType={channel.channelType}
        />
      )}

      {/* Register Webhooks: connected channels that support webhooks and haven't registered yet */}
      {channel.status === "connected" && !channel.hasWebhooks && (() => {
        const def = getChannelById(channel.channelType as Parameters<typeof getChannelById>[0]);
        return def?.capabilities?.usesWebhooks ? (
          <RegisterWebhooksButton channelId={channel.id} />
        ) : null;
      })()}

      {/* Fetch Products: connected channels that can fetch products */}
      {channel.status === "connected" && (() => {
        const def = getChannelById(channel.channelType as Parameters<typeof getChannelById>[0]);
        return def?.capabilities?.canFetchProducts ? (
          <FetchProductsButton channelId={channel.id} />
        ) : null;
      })()}

      {/* AI Auto-Map: connected channels that can fetch products and have a product cache */}
      {channel.status === "connected" && AGENT_REGISTRY.channelMapping.enabled && (() => {
        const def = getChannelById(channel.channelType as Parameters<typeof getChannelById>[0]);
        return def?.capabilities?.canFetchProducts && channel.cachedProductCount > 0 ? (
          <ChannelMappingTrigger channelId={channel.id} />
        ) : null;
      })()}

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
  connected?: string;
  mappedProductCounts?: Map<number, number>;
}

export function ChannelList({ channels, connected, mappedProductCounts }: ChannelListProps) {
  const router = useRouter();
  const shown = useRef(false);
  const [editingChannel, setEditingChannel] = useState<ChannelInstance | null>(null);

  useEffect(() => {
    if (connected && !shown.current) {
      shown.current = true;
      const connectedType = connected === "1" ? "woocommerce" : connected;
      const def = getChannelById(connectedType as Parameters<typeof getChannelById>[0]);
      const name = def?.name ?? "Store";
      toast.success(`${name} connected successfully.`, {
        description: `Your ${name} store is now syncing orders.`,
      });
      router.replace("/channels");
    }
  }, [connected, router]);

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
            <TableHead>Status</TableHead>
            <TableHead>Mapped Products</TableHead>
            <TableHead className="w-[320px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {channels.map((channel) => {
            const definition = getChannelById(
              channel.channelType as Parameters<typeof getChannelById>[0],
            );
            return (
              <TableRow
                key={channel.id}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setEditingChannel(channel)}
              >
                <TableCell>
                  <div className="font-medium">{channel.name}</div>
                  {channel.storeUrl && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {channel.storeUrl}
                    </div>
                  )}
                </TableCell>
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
                  <ChannelStatusBadge status={channel.status} />
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {mappedProductCounts?.get(channel.id)
                      ? `${mappedProductCounts.get(channel.id)} products`
                      : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <ChannelRowActions channel={channel} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {editingChannel && (
        <EditChannelDialog
          channel={editingChannel}
          onOpenChange={(open) => {
            if (!open) setEditingChannel(null);
          }}
        />
      )}
    </div>
  );
}
