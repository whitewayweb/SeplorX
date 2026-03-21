import { notFound } from "next/navigation";
import { getChannelForUser } from "@/lib/channels/queries";
import { getAuthenticatedUserId } from "@/lib/auth";
import { FeedsDashboard } from "./feeds-dashboard";
import { getChannelSyncStatusCounts, getChannelFeedsList } from "@/data/channels";

export const dynamic = "force-dynamic";

export default async function ChannelFeedsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const channelId = parseInt(resolvedParams.id, 10);
  if (isNaN(channelId)) notFound();

  // Scope by ownership to prevent IDOR — returns undefined for missing or unauthorized channels
  let userId: number;
  try {
    userId = await getAuthenticatedUserId();
  } catch {
    notFound();
  }

  const channel = await getChannelForUser(userId!, channelId);
  if (!channel) notFound();
  if (channel.channelType !== "amazon") notFound();

  const [statusCounts, feeds] = await Promise.all([
    getChannelSyncStatusCounts(channelId),
    getChannelFeedsList(channelId)
  ]);

  const statusMap: Record<string, number> = {};
  for (const row of statusCounts) {
    statusMap[row.syncStatus] = row.count;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{channel.name} — Uploads</h1>
        <p className="text-muted-foreground mt-1">
          Track product update submissions to Amazon via category template files.
        </p>
      </div>

      <FeedsDashboard
        channelId={channelId}
        statusMap={statusMap}
        feeds={feeds}
      />
    </div>
  );
}
