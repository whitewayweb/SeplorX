import { db } from "@/db";
import { salesOrders, channels } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { OrdersList } from "@/components/organisms/orders/orders-list";

export const dynamic = "force-dynamic";

export default async function ChannelOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const channelId = parseInt(resolvedParams.id, 10);

  if (isNaN(channelId)) {
    notFound();
  }

  const [channel] = await db
    .select({ id: channels.id, name: channels.name, channelType: channels.channelType })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);

  if (!channel) {
    notFound();
  }

  const channelOrders = await db
    .select({
      id: salesOrders.id,
      externalOrderId: salesOrders.externalOrderId,
      status: salesOrders.status,
      totalAmount: salesOrders.totalAmount,
      currency: salesOrders.currency,
      buyerName: salesOrders.buyerName,
      purchasedAt: salesOrders.purchasedAt,
      channelName: channels.name,
    })
    .from(salesOrders)
    .leftJoin(channels, eq(salesOrders.channelId, channels.id))
    .where(eq(salesOrders.channelId, channelId))
    .orderBy(desc(salesOrders.purchasedAt));

  return (
    <OrdersList 
      orders={channelOrders} 
      channels={channel.channelType === "amazon" ? [channel] : []} 
      title={`${channel.name} Orders`} 
    />
  );
}
