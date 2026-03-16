import { db } from "@/db";
import { salesOrders, channels } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { OrdersList } from "@/components/organisms/orders/orders-list";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const allOrders = await db
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
    .orderBy(desc(salesOrders.purchasedAt));

  const amazonChannels = await db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(eq(channels.channelType, "amazon"));

  return (
    <OrdersList 
      orders={allOrders} 
      channels={amazonChannels} 
      title="All Sales Orders" 
    />
  );
}
