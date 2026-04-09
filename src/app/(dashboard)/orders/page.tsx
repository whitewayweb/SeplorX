import { getAuthenticatedUserId } from "@/lib/auth";
import { getAllOrders, countAllOrders, getOrderStatusCounts } from "@/lib/channels/amazon/queries";
import { getConnectedChannelsForUser } from "@/lib/channels/queries";
import { getOrdersAwaitingReturnAction } from "@/data/stock";
import { OrdersList } from "@/components/organisms/orders/orders-list";
import { redirect } from "next/navigation";
import Link from "next/link";
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
  
  const fromParam = resolvedSearchParams.from as string;
  const toParam = resolvedSearchParams.to as string;
  
  // Define default range (30 days ago to now)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const dateFrom = fromParam === "all" ? undefined : (fromParam ? new Date(fromParam) : thirtyDaysAgo);
  const dateTo = toParam ? new Date(toParam) : (fromParam === "all" ? undefined : now);

  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const [allOrders, totalCount, statusCounts, connectedChannels, returnsAwaiting] = await Promise.all([
    getAllOrders(userId, limit, offset, statusFilter, dateFrom, dateTo),
    countAllOrders(userId, statusFilter, dateFrom, dateTo),
    getOrderStatusCounts(userId, undefined, dateFrom, dateTo),
    getConnectedChannelsForUser(userId),
    getOrdersAwaitingReturnAction(),
  ]);

  return (
    <>
      {returnsAwaiting.length > 0 && (
        <div className="mx-4 sm:mx-8 mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
          <span>
            <strong>{returnsAwaiting.length}</strong> order{returnsAwaiting.length > 1 ? "s" : ""} with returns awaiting inspection
          </span>
          <Link
            href="/orders?status=returned"
            className="font-medium underline hover:text-amber-900"
          >
            View
          </Link>
        </div>
      )}
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
    </>
  );
}

