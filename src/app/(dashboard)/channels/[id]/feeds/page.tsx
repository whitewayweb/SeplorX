import { notFound } from "next/navigation";
import { db } from "@/db";
import { channelProductMappings, channelFeeds } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getChannel } from "@/lib/channels/queries";
import { FeedsDashboard } from "./feeds-dashboard";

export const dynamic = "force-dynamic";

export default async function ChannelFeedsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const channelId = parseInt(resolvedParams.id, 10);
  if (isNaN(channelId)) notFound();

  const channel = await getChannel(channelId);
  if (!channel) notFound();
  if (channel.channelType !== "amazon") notFound();

  // ── Sync status overview ────────────────────────────────────────────────
  const statusCounts = await db
    .select({
      syncStatus: channelProductMappings.syncStatus,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(channelProductMappings)
    .where(eq(channelProductMappings.channelId, channelId))
    .groupBy(channelProductMappings.syncStatus);

  const statusMap: Record<string, number> = {};
  for (const row of statusCounts) {
    statusMap[row.syncStatus] = row.count;
  }

  // ── Recent feed history ─────────────────────────────────────────────────
  const feeds = await db
    .select({
      id: channelFeeds.id,
      feedId: channelFeeds.feedId,
      feedType: channelFeeds.feedType,
      category: channelFeeds.category,
      status: channelFeeds.status,
      productCount: channelFeeds.productCount,
      errorCount: channelFeeds.errorCount,
      uploadUrl: channelFeeds.uploadUrl,
      resultDocumentUrl: channelFeeds.resultDocumentUrl,
      errorMessage: channelFeeds.errorMessage,
      createdAt: channelFeeds.createdAt,
      updatedAt: channelFeeds.updatedAt,
    })
    .from(channelFeeds)
    .where(eq(channelFeeds.channelId, channelId))
    .orderBy(desc(channelFeeds.createdAt))
    .limit(50);

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
