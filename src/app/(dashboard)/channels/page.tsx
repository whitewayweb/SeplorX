export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/molecules/layout/page-header";
import { ChannelList } from "@/components/organisms/channels/channel-list";
import { AddChannelWizard } from "@/components/organisms/channels/add-channel-wizard";
import type { ChannelInstance } from "@/lib/channels/types";
import { getCachedProductCountsByChannel } from "@/lib/channels/queries";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getChannelsListWithWebhooks, getMappedProductsCountPerChannel } from "@/data/channels";

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string }>;
}) {
  const { connected } = await searchParams;
  const userId = await getAuthenticatedUserId();

  // Run the 3 independent data fetching operations in parallel
  const [channelsRows, cachedProductCountMap, mappingCounts] = await Promise.all([
    getChannelsListWithWebhooks(userId),
    getCachedProductCountsByChannel(),
    getMappedProductsCountPerChannel(userId),
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

      <ChannelList
        channels={channelInstances}
        connected={connected || undefined}
        mappedProductCounts={mappedProductCounts}
      />
    </div>
  );
}
