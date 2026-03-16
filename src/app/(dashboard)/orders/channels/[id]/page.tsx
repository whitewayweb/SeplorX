import { getAuthenticatedUserId } from "@/lib/auth";
import { getOrdersByChannel, getAmazonChannelsForUser } from "@/lib/channels/amazon/queries";
import { OrdersList } from "@/components/organisms/orders/orders-list";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ChannelOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const channelId = parseInt(id, 10);
  if (isNaN(channelId)) notFound();

  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  // Fetching channels for the user so we can confirm ownership and get channel name
  const userChannels = await getAmazonChannelsForUser(userId);
  const channel = userChannels.find((c) => c.id === channelId);
  if (!channel) notFound();

  const orders = await getOrdersByChannel(userId, channelId);

  return (
    <OrdersList
      orders={orders}
      channels={[channel]}
      title={`${channel.name} Orders`}
    />
  );
}
