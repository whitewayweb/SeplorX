"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SyncStatusPill } from "@/components/molecules/orders/sync-status-pill";
import { BulkSyncSelectedOrdersModal } from "@/components/organisms/orders/bulk-sync-selected-orders-modal";
import { TablePagination } from "@/components/ui/table-pagination";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/organisms/orders/date-range-picker";
import { getOrderStatusBadgeClass, getOrderStatusLabel } from "@/lib/utils/order-status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { isFinanceEligibleOrderStatus } from "@/lib/order-finance/eligibility";
import { formatDistanceToNow } from "date-fns";
import type { OrderItemRow } from "@/lib/orders/queries";
import { formatChannelDateTime } from "@/lib/channels/utils";

interface Order {
  id: number;
  channelId: number;
  externalOrderId: string | null;
  status: string | null;
  totalAmount: string | null;
  currency: string | null;
  buyerName: string | null;
  purchasedAt: Date | null;
  channelName: string | null;
  financeSyncStatus: "pending" | "synced" | "no_data" | "failed" | "not_supported" | null;
  financeSyncedAt: Date | null;
  financeNextAttemptAt: Date | null;
  items?: OrderItemRow[];
}

interface Channel {
  id: number;
  name: string;
  lastSyncAt?: Date | null;
  color?: string;
  timeZone?: string;
  locale?: string;
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

const FINANCE_STATUS_META = {
  unsynced: {
    label: "Missing",
    className: "bg-yellow-50 text-yellow-800 ring-yellow-200",
    helper: "Auto sync pending",
  },
  pending: {
    label: "Auto sync",
    className: "bg-blue-50 text-blue-800 ring-blue-200",
    helper: "Automatic retry pending",
  },
  synced: {
    label: "Synced",
    className: "bg-green-50 text-green-800 ring-green-200",
    helper: "Finance saved",
  },
  no_data: {
    label: "No data",
    className: "bg-gray-100 text-gray-700 ring-gray-200",
    helper: "Auto retry scheduled",
  },
  failed: {
    label: "Failed",
    className: "bg-red-50 text-red-800 ring-red-200",
    helper: "Auto retry scheduled",
  },
  not_supported: {
    label: "N/A",
    className: "bg-gray-100 text-gray-600 ring-gray-200",
    helper: "Not supported",
  },
  not_ready: {
    label: "Not ready",
    className: "bg-gray-100 text-gray-600 ring-gray-200",
    helper: "Awaiting shipment",
  },
} as const;

function getFinanceStatusMeta(order: Order) {
  const { financeSyncStatus: status } = order;
  if (status) return FINANCE_STATUS_META[status];
  if (!isFinanceEligibleOrderStatus(order.status)) return FINANCE_STATUS_META.not_ready;
  return FINANCE_STATUS_META.unsynced;
}

function getImageUrl(item: OrderItemRow): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = item.productRawData as any;
  if (!data) return "";

  // Amazon mainImage in summaries
  if (data?.summaries?.[0]?.mainImage?.link) {
    return data.summaries[0].mainImage.link;
  }
  // Amazon images array fallback
  if (data?.images?.[0]?.images?.[0]?.link) {
    return data.images[0].images[0].link;
  }
  // WooCommerce images array
  if (data?.images?.[0]?.src) {
    return data.images[0].src;
  }
  return "";
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
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [bulkSyncModalOpen, setBulkSyncModalOpen] = useState(false);

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
  const selectableOrderIds = useMemo(() => orders.map((order) => order.id), [orders]);
  const selectableOrderIdSet = useMemo(() => new Set(selectableOrderIds), [selectableOrderIds]);
  const effectiveSelectedOrderIds = useMemo(
    () => [...selectedOrderIds].filter((orderId) => selectableOrderIdSet.has(orderId)),
    [selectedOrderIds, selectableOrderIdSet],
  );
  const effectiveSelectedOrderIdSet = useMemo(() => new Set(effectiveSelectedOrderIds), [effectiveSelectedOrderIds]);
  const selectedOrders = orders
    .filter((order) => effectiveSelectedOrderIdSet.has(order.id))
    .map((order) => ({
      id: order.id,
      externalOrderId: order.externalOrderId,
    }));
  const selectedCount = effectiveSelectedOrderIds.length;
  const isAllSelected = selectableOrderIds.length > 0 && selectedCount === selectableOrderIds.length;
  const isSomeSelected = selectedCount > 0 && selectedCount < selectableOrderIds.length;

  function handleSelectAll(checked: boolean | "indeterminate") {
    setSelectedOrderIds(checked === true ? new Set(selectableOrderIds) : new Set());
  }

  function handleSelectRow(orderId: number, checked: boolean) {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }

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

      {selectedCount > 0 && (
        <div className="flex min-h-10 items-center justify-between pb-3">
          <div className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <span className="mr-2 text-sm font-medium text-muted-foreground">
              {selectedCount} selected
            </span>
            <Button
              onClick={() => setBulkSyncModalOpen(true)}
              variant="secondary"
              size="sm"
              className="h-8 border shadow-sm"
            >
              Sync Selected
            </Button>
            <Button
              onClick={() => setSelectedOrderIds(new Set())}
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
            >
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow border overflow-x-auto overflow-y-hidden max-w-full">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-[44px] px-4 py-3 text-left">
                <span title={selectableOrderIds.length === 0 ? "No orders on this page." : undefined}>
                  <Checkbox
                    checked={isAllSelected || (isSomeSelected ? "indeterminate" : false)}
                    onCheckedChange={handleSelectAll}
                    disabled={selectableOrderIds.length === 0}
                    aria-label="Select all orders"
                  />
                </span>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order Details</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                  No orders found. Use the button above to fetch orders.
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const financeStatus = getFinanceStatusMeta(order);
                const timeZone = channels.find((c) => c.id === order.channelId)?.timeZone || "UTC";
                const locale = channels.find((c) => c.id === order.channelId)?.locale || "en-US";

                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors align-top">
                    <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={effectiveSelectedOrderIdSet.has(order.id)}
                        onCheckedChange={(checked) => handleSelectRow(order.id, checked === true)}
                        aria-label={`Select order ${order.externalOrderId ?? order.id}`}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900 text-sm">
                          {order.purchasedAt ? formatDistanceToNow(order.purchasedAt, { addSuffix: true }) : "—"}
                        </span>
                        <span className="text-xs text-gray-500 mt-1">
                          {formatChannelDateTime(order.purchasedAt, timeZone, locale)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start text-sm">
                        <Link
                          href={`/orders/${order.id}`}
                          prefetch={false}
                          className="text-blue-600 hover:underline font-bold mb-1"
                        >
                          {order.externalOrderId}
                        </Link>
                        <span className="text-xs text-gray-600 mt-1 whitespace-nowrap">
                          Buyer name: {order.buyerName ? <span className="font-medium text-gray-900">{order.buyerName}</span> : <span className="text-gray-400 italic">Amazon Anonymized</span>}
                        </span>
                        <span className="text-xs text-gray-600 mt-0.5 whitespace-nowrap">
                          Sales channel: <span className="font-medium text-gray-900">{order.channelName ?? "—"}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-4">
                        {(order.items?.length ? order.items : [null]).map((item, idx) => {
                          if (!item) return <div key={idx} className="h-16 w-16" />;
                          const imgUrl = getImageUrl(item);
                          return (
                            <div key={item.id} className="h-16 w-16 flex-shrink-0 bg-white rounded border border-gray-200 flex items-center justify-center p-1">
                              { }
                              {imgUrl ? (
                                <img src={imgUrl} alt="product" className="h-full w-full object-contain mix-blend-multiply" />
                              ) : (
                                <span className="text-gray-300 text-[10px] text-center leading-tight">No Image</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 min-w-[300px]">
                      <div className="flex flex-col gap-4">
                        {(order.items?.length ? order.items : [null]).map((item, idx) => {
                          if (!item) return <div key={idx} className="text-sm text-gray-400 italic">No items</div>;
                          return (
                            <div key={item.id} className="flex flex-col">
                              <Link href={`/orders/${order.id}`} prefetch={false} className="text-sm font-medium text-blue-600 hover:underline line-clamp-2 leading-tight">
                                {item.productName || item.title || "Unknown Product"}
                              </Link>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                <span className="text-xs text-gray-500">SKU: <span className="font-medium text-gray-700">{item.sku || item.productSku || "—"}</span></span>
                                <span className="text-xs text-gray-500">ASIN: <span className="font-medium text-gray-700">{item.externalItemId || "—"}</span></span>
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">Qty: {item.quantity}</span>
                                {item.price && (
                                  <span className="text-xs text-gray-500">Price: {item.price}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-2 items-start">
                        <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${getOrderStatusBadgeClass(order.status)}`}>
                          {order.status}
                        </span>
                        <div>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${financeStatus.className}`}>
                            {financeStatus.label}
                          </span>
                          <div className="mt-0.5 text-[11px] text-gray-400">
                            {financeStatus.helper}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex flex-col gap-3 items-end">
                        <div className="text-sm font-bold text-gray-900">
                          {order.currency && order.totalAmount
                            ? `${order.currency} ${parseFloat(order.totalAmount).toFixed(2)}`
                            : "—"}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
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
      <BulkSyncSelectedOrdersModal
        open={bulkSyncModalOpen}
        onOpenChange={setBulkSyncModalOpen}
        selectedOrders={selectedOrders}
        onSuccessComplete={() => setSelectedOrderIds(new Set())}
      />
    </div>
  );
}
