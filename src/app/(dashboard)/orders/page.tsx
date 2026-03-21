import { getAuthenticatedUserId } from "@/lib/auth";
import { getAllOrders, countAllOrders, getOrderStatusCounts } from "@/lib/channels/amazon/queries";
import { getConnectedChannelsForUser } from "@/lib/channels/queries";
import { OrdersList } from "@/components/organisms/orders/orders-list";
import { redirect } from "next/navigation";
import { parsePaginationParams } from "@/lib/utils/pagination";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const { page, limit, offset } = parsePaginationParams(resolvedSearchParams);
  const rawStatus = (resolvedSearchParams.status as string) || "pending";
  const statusFilter = rawStatus === "all" ? undefined : rawStatus;
  
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const [allOrders, totalCount, statusCounts, connectedChannels] = await Promise.all([
    getAllOrders(userId, limit, offset, statusFilter),
    countAllOrders(userId, statusFilter),
    getOrderStatusCounts(userId),
    getConnectedChannelsForUser(userId),
  ]);

  return (
    <OrdersList
      orders={allOrders}
      channels={connectedChannels}
      title="All Sales Orders"
      currentPage={page}
      totalCount={totalCount}
      pageSize={limit}
      currentStatus={rawStatus}
      statusCounts={statusCounts}
    />
  );
}

