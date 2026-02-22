export const dynamic = "force-dynamic";

import { db } from "@/db";
import { channels } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ChannelList } from "@/components/channels/channel-list";
import { AddChannelWizard } from "@/components/channels/add-channel-wizard";
import type { ChannelInstance } from "@/lib/channels/types";

const CURRENT_USER_ID = 1;

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string }>;
}) {
  const { connected } = await searchParams;

  // Fetch credentials only to derive hasWebhooks — never sent to the client
  const rows = await db
    .select({
      id: channels.id,
      channelType: channels.channelType,
      name: channels.name,
      status: channels.status,
      storeUrl: channels.storeUrl,
      defaultPickupLocation: channels.defaultPickupLocation,
      createdAt: channels.createdAt,
      credentials: channels.credentials,
    })
    .from(channels)
    .where(eq(channels.userId, CURRENT_USER_ID))
    .orderBy(channels.createdAt);

  const channelInstances: ChannelInstance[] = rows.map(({ credentials, ...row }) => ({
    ...row,
    hasWebhooks: typeof credentials?.webhookSecret === "string" && credentials.webhookSecret.length > 0,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Channels</h1>
          <p className="text-muted-foreground mt-1">
            Connect your e-commerce stores to sync orders automatically.
          </p>
        </div>
        <AddChannelWizard />
      </div>
      <ChannelList channels={channelInstances} connected={connected === "1"} />
    </div>
  );
}
