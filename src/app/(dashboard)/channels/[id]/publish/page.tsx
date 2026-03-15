import { notFound } from "next/navigation";
import { db } from "@/db";
import { channelProductMappings, channelProducts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getChannelForUser } from "@/lib/channels/queries";
import { getChannelById } from "@/lib/channels/registry";
import { getAuthenticatedUserId } from "@/lib/auth";
import { ChannelSyncDashboard } from "@/components/organisms/channels/sync-dashboard";

export const dynamic = "force-dynamic";

/**
 * Generic sync page for any channel that declares canPushProductUpdates.
 * The page loads data; the organism renders the UI; the handler does the push.
 * Adding a new channel = zero changes here.
 */
export default async function ChannelSyncPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const channelId = parseInt(resolvedParams.id, 10);
  if (isNaN(channelId)) notFound();

  let userId: number;
  try {
    userId = await getAuthenticatedUserId();
  } catch {
    notFound();
  }

  const channel = await getChannelForUser(userId!, channelId);
  if (!channel) notFound();

  // Gate by capability — not by channel type
  const channelDef = getChannelById(channel.channelType);
  if (!channelDef?.capabilities?.canPushProductUpdates) notFound();

  // ── Status counts ──────────────────────────────────────────────────────
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

  // ── Pending products ───────────────────────────────────────────────────
  const pendingProducts = await db
    .select({
      externalProductId: channelProductMappings.externalProductId,
      name: channelProducts.name,
      sku: channelProducts.sku,
      rawData: channelProducts.rawData,
    })
    .from(channelProductMappings)
    .leftJoin(
      channelProducts,
      and(
        eq(channelProducts.channelId, channelId),
        eq(channelProducts.externalId, channelProductMappings.externalProductId),
      ),
    )
    .where(
      and(
        eq(channelProductMappings.channelId, channelId),
        eq(channelProductMappings.syncStatus, "pending_update"),
      ),
    );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{channel.name} — Publish Updates</h1>
        <p className="text-muted-foreground mt-1">
          Review and publish staged product updates to {channelDef.name}.
        </p>
      </div>

      <ChannelSyncDashboard
        channelId={channelId}
        channelName={channel.name}
        pendingCount={statusMap["pending_update"] ?? 0}
        failedCount={statusMap["failed"] ?? 0}
        inSyncCount={statusMap["in_sync"] ?? 0}
        pendingProducts={pendingProducts}
      />
    </div>
  );
}
