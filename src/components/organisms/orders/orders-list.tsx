import Link from "next/link";
import { FetchOrdersButton } from "./fetch-orders-button";
import { ClearOrdersButton } from "./clear-orders-button";
import { TablePagination } from "@/components/ui/table-pagination";

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
}

interface OrdersListProps {
  orders: Order[];
  channels?: Channel[];
  title?: string;
  currentPage: number;
  totalCount: number;
  pageSize: number;
  showClear?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  shipped:   "bg-green-100 text-green-800",
  pending:   "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-800",
  returned:  "bg-orange-100 text-orange-800",
  failed:    "bg-gray-100 text-gray-700",
};

export function OrdersList({ 
  orders, 
  channels = [], 
  title = "Sales Orders",
  currentPage,
  totalCount,
  pageSize,
  showClear = false,
}: OrdersListProps) {
  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground mt-1">
            Total {totalCount} order{totalCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {channels.map((channel) => (
            <div key={channel.id} className="flex gap-2">
              <FetchOrdersButton
                channelId={channel.id}
                channelName={channel.name}
              />
              {showClear && totalCount > 0 && (
                <ClearOrdersButton channelId={channel.id} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden border">
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
                    {order.purchasedAt?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) ?? "—"}
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
                    <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      STATUS_COLORS[order.status ?? ""] ?? "bg-gray-100 text-gray-700"
                    }`}>
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

