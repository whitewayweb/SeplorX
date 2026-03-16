import { getAuthenticatedUserId } from "@/lib/auth";
import { getAllOrders, getAmazonChannelsForUser } from "@/lib/channels/amazon/queries";
import { OrdersList } from "@/components/organisms/orders/orders-list";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const [allOrders, amazonChannels] = await Promise.all([
    getAllOrders(userId),
    getAmazonChannelsForUser(userId),
  ]);

  return (
    <OrdersList
      orders={allOrders}
      channels={amazonChannels}
      title="All Sales Orders"
    />
  );
}
