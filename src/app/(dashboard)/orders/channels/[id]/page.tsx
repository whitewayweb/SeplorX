import { getAuthenticatedUserId } from "@/lib/auth";
import { getOrdersByChannel, getAmazonChannelsForUser, countOrdersByChannel } from "@/lib/channels/amazon/queries";
import { OrdersList } from "@/components/organisms/orders/orders-list";
import { notFound, redirect } from "next/navigation";
import { parsePaginationParams } from "@/lib/utils/pagination";

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

  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  // Fetching channels for the user so we can confirm ownership and get channel name
  const userChannels = await getAmazonChannelsForUser(userId);
  const channel = userChannels.find((c) => c.id === channelId);
  if (!channel) notFound();

  const [orders, totalCount] = await Promise.all([
    getOrdersByChannel(userId, channelId, limit, offset),
    countOrdersByChannel(userId, channelId),
  ]);

  return (
    <OrdersList
      orders={orders}
      channels={[channel]}
      title={`${channel.name} Orders`}
      currentPage={page}
      totalCount={totalCount}
      pageSize={limit}
      showClear={true}
    />
  );
}

