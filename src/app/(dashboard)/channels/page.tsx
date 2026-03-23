export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/molecules/layout/page-header";
import { ChannelList } from "@/components/organisms/channels/channel-list";
import { AddChannelWizard } from "@/components/organisms/channels/add-channel-wizard";
import { ChannelMappingApprovalCard } from "@/components/organisms/agents/channel-mapping-approval-card";
import type { ChannelInstance } from "@/lib/channels/types";
import type { ChannelMappingPlan } from "@/lib/agents/tools/channel-mapping-tools";
import { getCachedProductCountsByChannel } from "@/lib/channels/queries";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getChannelsListWithWebhooks, getMappedProductsCountPerChannel } from "@/data/channels";
import { getPendingAgentTasks } from "@/data/agents";

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string }>;
}) {
  const { connected } = await searchParams;
  const userId = await getAuthenticatedUserId();

  // Run the 4 independent data fetching operations in parallel
  const [channelsRows, cachedProductCountMap, mappingCounts, pendingMappingTasks] = await Promise.all([
    getChannelsListWithWebhooks(userId),
    getCachedProductCountsByChannel(),
    getMappedProductsCountPerChannel(userId),
    getPendingAgentTasks("channel_mapping")
  ]);

  const channelInstances: ChannelInstance[] = channelsRows.map((row) => ({
    ...row,
    cachedProductCount: cachedProductCountMap.get(row.id) ?? 0,
  }));

  const mappedProductCounts = new Map(mappingCounts.map((r) => [r.channelId, r.count]));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Channels"
        description="Connect your e-commerce stores to sync orders automatically."
      >
        <AddChannelWizard />
      </PageHeader>

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
