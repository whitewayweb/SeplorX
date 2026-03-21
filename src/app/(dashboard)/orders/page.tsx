import { getAuthenticatedUserId } from "@/lib/auth";
import { getAllOrders, countAllOrders, getOrderStatusCounts } from "@/lib/channels/amazon/queries";
import { getConnectedChannelsForUser } from "@/lib/channels/queries";
import { OrdersList } from "@/components/organisms/orders/orders-list";
import { redirect } from "next/navigation";
import { parsePaginationParams } from "@/lib/utils/pagination";
import { salesOrderStatusEnum } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const { page, limit, offset } = parsePaginationParams(resolvedSearchParams);
  
  const rawParam = resolvedSearchParams.status;
  const statusString = Array.isArray(rawParam) ? rawParam[0] : rawParam;
  const rawStatus = statusString || "all";
  
  const isValid = (salesOrderStatusEnum.enumValues as readonly string[]).includes(rawStatus);
  const statusFilter = isValid ? rawStatus : undefined;
  
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

