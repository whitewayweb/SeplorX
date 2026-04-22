import { getAuthenticatedUserId } from "@/lib/auth";
import { getOrdersByChannel, countOrdersByChannel, getOrderStatusCounts } from "@/lib/channels/amazon/queries";
import { getConnectedChannelsForUser, getLastSyncDate } from "@/lib/channels/queries";
import { OrdersList } from "@/components/organisms/orders/orders-list";
import { notFound, redirect } from "next/navigation";
import { parsePaginationParams } from "@/lib/utils/pagination";
import { salesOrderStatusEnum } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function ChannelOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const channelId = parseInt(id, 10);
  if (isNaN(channelId)) notFound();

  const resolvedSearchParams = await searchParams;
  const { page, limit, offset } = parsePaginationParams(resolvedSearchParams);
  
  const rawParam = resolvedSearchParams.status;
  const statusString = Array.isArray(rawParam) ? rawParam[0] : rawParam;
  const rawStatus = statusString || "all";
  
  const isValid = (salesOrderStatusEnum.enumValues as readonly string[]).includes(rawStatus);
  const statusFilter = isValid ? rawStatus : undefined;

  const fromParam = resolvedSearchParams.from as string;
  const toParam = resolvedSearchParams.to as string;
  
  // Define default range (30 days ago to now)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const dateFrom = fromParam === "all" ? undefined : (fromParam ? new Date(fromParam) : thirtyDaysAgo);
  const dateTo = toParam ? new Date(toParam) : (fromParam === "all" ? undefined : now);

  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  // Fetching channels for the user so we can confirm ownership and get channel name
  const userChannels = await getConnectedChannelsForUser(userId);
  const channel = userChannels.find((c) => c.id === channelId);
  if (!channel) notFound();

  const [orders, totalCount, statusCounts] = await Promise.all([
    getOrdersByChannel(userId, channelId, limit, offset, statusFilter, dateFrom, dateTo),
    countOrdersByChannel(userId, channelId, statusFilter, dateFrom, dateTo),
    getOrderStatusCounts(userId, channelId, dateFrom, dateTo),
  ]);

  const ordersWithLastSync = {
    ...channel,
    lastSyncAt: await getLastSyncDate(channel.id),
  };

  return (
    <OrdersList
      orders={orders}
      channels={[ordersWithLastSync]}
      title={`${channel.name} Orders`}
      currentPage={page}
      totalCount={totalCount}
      pageSize={limit}
      showClear={true}
      currentStatus={rawStatus}
      statusCounts={statusCounts}
    />
  );
}

