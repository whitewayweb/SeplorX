import { getAuthenticatedUserId } from "@/lib/auth";
import { getAllOrders, getAmazonChannelsForUser, countAllOrders } from "@/lib/channels/amazon/queries";
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
  const status = (resolvedSearchParams.status as string) || "pending";
  
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const [allOrders, totalCount, amazonChannels] = await Promise.all([
    getAllOrders(userId, limit, offset, status),
    countAllOrders(userId, status),
    getAmazonChannelsForUser(userId),
  ]);

  return (
    <OrdersList
      orders={allOrders}
      channels={amazonChannels}
      title="All Sales Orders"
      currentPage={page}
      totalCount={totalCount}
      pageSize={limit}
      currentStatus={status}
    />
  );
}

