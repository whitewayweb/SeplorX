export const dynamic = "force-dynamic";

import { db } from "@/db";
import { channels, channelProductMappings, agentActions } from "@/db/schema";
import { and, countDistinct, desc, eq } from "drizzle-orm";
import { ChannelList } from "@/components/channels/channel-list";
import { AddChannelWizard } from "@/components/channels/add-channel-wizard";
import { ChannelMappingApprovalCard } from "@/components/agents/channel-mapping-approval-card";
import type { ChannelInstance } from "@/lib/channels/types";
import type { ChannelMappingPlan } from "@/lib/agents/tools/channel-mapping-tools";
import { getCachedProductCountsByChannel } from "@/lib/channels/queries";
import { getAuthenticatedUserId } from "@/lib/auth";

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string }>;
}) {
  const { connected } = await searchParams;
  const userId = await getAuthenticatedUserId();

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
    .where(eq(channels.userId, userId))
    .orderBy(channels.createdAt);

  const channelInstances: ChannelInstance[] = rows.map(({ credentials, ...row }) => ({
    ...row,
    hasWebhooks: typeof credentials?.webhookSecret === "string" && credentials.webhookSecret.length > 0,
    cachedProductCount: 0, // populated below
  }));

  const cachedProductCountMap = await getCachedProductCountsByChannel();
  for (const instance of channelInstances) {
    instance.cachedProductCount = cachedProductCountMap.get(instance.id) ?? 0;
  }

  // Count DISTINCT mapped products per channel (for the "Mapped Products" column)
  const mappingCounts = await db
    .select({
      channelId: channelProductMappings.channelId,
      count: countDistinct(channelProductMappings.productId),
    })
    .from(channelProductMappings)
    .groupBy(channelProductMappings.channelId);

  const mappedProductCounts = new Map(mappingCounts.map((r) => [r.channelId, r.count]));

  // Pending AI channel mapping approvals
  const pendingMappingTasks = await db
    .select({
      id: agentActions.id,
      plan: agentActions.plan,
      createdAt: agentActions.createdAt,
    })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.status, "pending_approval"),
        eq(agentActions.agentType, "channel_mapping"),
      ),
    )
    .orderBy(desc(agentActions.createdAt));

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

      {/* Pending AI mapping approvals */}
      {pendingMappingTasks.length > 0 && (
        <div className="space-y-3">
          {pendingMappingTasks.map((task) => (
            <ChannelMappingApprovalCard
              key={task.id}
              taskId={task.id}
              plan={task.plan as unknown as ChannelMappingPlan}
              createdAt={task.createdAt}
            />
          ))}
        </div>
      )}

      <ChannelList
        channels={channelInstances}
        connected={connected || undefined}
        mappedProductCounts={mappedProductCounts}
      />
    </div>
  );
}
