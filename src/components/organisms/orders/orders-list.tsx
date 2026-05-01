"use client";

import Link from "next/link";
import { SyncStatusPill } from "@/components/molecules/orders/sync-status-pill";
import { TablePagination } from "@/components/ui/table-pagination";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/organisms/orders/date-range-picker";
import { getOrderStatusBadgeClass, getOrderStatusLabel } from "@/lib/utils/order-status";

interface Order {
  id: number;
  externalOrderId: string | null;
  status: string | null;
  totalAmount: string | null;
  currency: string | null;
  buyerName: string | null;
  purchasedAt: Date | null;
  channelName: string | null;
}

interface Channel {
  id: number;
  name: string;
  lastSyncAt?: Date | null;
  color?: string;
}

interface OrdersListProps {
  orders: Order[];
  channels?: Channel[];
  title?: string;
  currentPage: number;
  totalCount: number;
  pageSize: number;
  showClear?: boolean;
  currentStatus?: string;
  statusCounts?: Record<string, number>;
}

export function OrdersList({
  orders,
  channels = [],
  title = "Sales Orders",
  currentPage,
  totalCount,
  pageSize,
  showClear = false,
  currentStatus = "",
  statusCounts = {},
}: OrdersListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status) {
      params.set("status", status);
    } else {
      params.delete("status");
    }
    params.set("page", "1"); // Reset to first page on filter change
    router.push(`${pathname}?${params.toString()}`);
  };

  const ALL_STATUSES = [
    "pending", "processing", "on-hold", "packed", "shipped",
    "delivered", "cancelled", "returned", "refunded", "failed", "draft"
  ];

  const statusTabs = [
    ...ALL_STATUSES.map((status) => ({
      label: getOrderStatusLabel(status),
      value: status,
      count: statusCounts[status] || 0,
    })),
    {
      label: "All",
      value: "all",
      count: Object.values(statusCounts).reduce((a, b) => a + b, 0)
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-full overflow-hidden">
      <div className="mb-8 min-w-0">
        <h1 className="text-3xl font-bold truncate">{title}</h1>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex-shrink-0">
          <DateRangePicker />
        </div>
        
        <div className="flex flex-wrap gap-3 shrink-0 lg:justify-end">
          {channels.map((channel) => (
            <SyncStatusPill
              key={channel.id}
              channelId={channel.id}
              channelName={channel.name}
              lastSyncAt={channel.lastSyncAt}
              color={channel.color}
              showClear={showClear && totalCount > 0}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 mb-6 border-b">
        <div className="overflow-x-auto scrollbar-hide pb-0.5">
          <div className="flex gap-1 min-w-max">
            {statusTabs.map((tab) => {
              const isActive = currentStatus === tab.value || (tab.value === "all" && !currentStatus);
              return (
                <button
                  key={tab.value}
                  onClick={() => handleStatusChange(tab.value)}
                  className={cn(
                    "group px-2 py-2 text-sm font-medium border-b-2 transition-colors -mb-[2px] flex-shrink-0 flex items-center gap-2",
                    isActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold transition-colors",
                      getOrderStatusBadgeClass(tab.value)
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow border overflow-x-auto overflow-y-hidden max-w-full">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Channel</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Total</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                  No orders found. Use the button above to fetch orders.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {order.purchasedAt?.toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    }) ?? "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {order.externalOrderId}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {order.channelName ?? "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {order.buyerName ?? <span className="text-gray-400 italic text-xs">Amazon Anonymized</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${getOrderStatusBadgeClass(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
                    {order.currency && order.totalAmount
                      ? `${order.currency} ${parseFloat(order.totalAmount).toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="px-6 py-4 bg-gray-50 border-t">
          <TablePagination
            totalItems={totalCount}
            itemsPerPage={pageSize}
            currentPage={currentPage}
          />
        </div>
      </div>
    </div>
  );
}
