import { getAuthenticatedUserId } from "@/lib/auth";
import { getOrderDetail, getOrderItems } from "@/lib/channels/amazon/queries";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { OrdersV0Schema } from "@/lib/channels/amazon/api/types/ordersV0Schema";
import { ReturnActionDialog } from "@/components/organisms/orders/return-action-dialog";

export const dynamic = "force-dynamic";

const RETURN_DISPOSITION_BADGES: Record<string, { label: string; className: string }> = {
  pending_inspection: { label: "Pending Inspection", className: "bg-amber-100 text-amber-800" },
  restocked:          { label: "Restocked",          className: "bg-green-100 text-green-800" },
  discarded:          { label: "Discarded",           className: "bg-red-100 text-red-800" },
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const orderIdNum = parseInt(orderId, 10);
  if (isNaN(orderIdNum)) notFound();

  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  // Sequential fetch: Order detail ensures ownership before items are fetched
  const order = await getOrderDetail(userId, orderIdNum);
  if (!order) notFound();

  const items = await getOrderItems(userId, orderIdNum);

  // Read from the narrowed JSONB fields directly
  const rawOrder = order.rawOrder;
  const addr = order.shippingAddress?.ShippingAddress;

  const matchedCount = items.filter((i) => i.channelProductId !== null).length;
  const isReturned = order.status === "returned";
  const returnDisposition = order.returnDisposition;

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/orders/channels/${order.channelId}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {order.channelName} Orders
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold font-mono">{order.externalOrderId}</h1>
            <p className="text-gray-500 mt-0.5">
              {order.purchasedAt?.toLocaleString("en-IN", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
                hour: "2-digit", minute: "2-digit"
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
              order.status === "shipped"   ? "bg-green-100 text-green-800"  :
              order.status === "cancelled" ? "bg-red-100 text-red-800"      :
              order.status === "returned"  ? "bg-orange-100 text-orange-800":
                                             "bg-yellow-100 text-yellow-800"
            }`}>
              {order.status}
            </span>
            {isReturned && returnDisposition && (
              <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                RETURN_DISPOSITION_BADGES[returnDisposition]?.className ?? "bg-gray-100 text-gray-800"
              }`}>
                {RETURN_DISPOSITION_BADGES[returnDisposition]?.label ?? returnDisposition}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Order Items */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-800">
                Order Items ({items.length}) · {matchedCount}/{items.length} matched
              </h2>
            </div>
            <div className="divide-y">
              {items.map((item) => {
                const rawItem = item.rawData as OrdersV0Schema["OrderItem"] | null;
                const itemDisposition = item.returnDisposition;
                const maxReturnable = item.quantity - item.returnQuantity;
                const showReturnDialog = isReturned && item.productId && maxReturnable > 0;

                return (
                  <div key={item.id} className="px-6 py-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        {(() => {
                          const searchQuery = item.sku || rawItem?.ASIN;
                          if (searchQuery) {
                            return (
                              <Link
                                href={`/products/channels/${order.channelId}?q=${encodeURIComponent(searchQuery)}`}
                                className="font-medium text-blue-600 hover:text-blue-800 text-sm leading-snug hover:underline"
                              >
                                {item.title ?? "Unknown product"}
                              </Link>
                            );
                          }
                          return (
                            <p className="font-medium text-gray-900 text-sm leading-snug">
                              {item.title ?? "Unknown product"}
                            </p>
                          );
                        })()}
                        <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                          {item.sku && (
                            <span className="text-xs text-gray-400 font-mono">SKU: {item.sku}</span>
                          )}
                          {rawItem?.ASIN && (
                            <span className="text-xs text-gray-400 font-mono">ASIN: {rawItem.ASIN}</span>
                          )}
                          {/* Return disposition badge per item */}
                          {isReturned && itemDisposition && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              RETURN_DISPOSITION_BADGES[itemDisposition]?.className ?? "bg-gray-100 text-gray-700"
                            }`}>
                              {RETURN_DISPOSITION_BADGES[itemDisposition]?.label ?? itemDisposition}
                              {item.returnQuantity > 0 && item.returnQuantity < item.quantity && (
                                <> ({item.returnQuantity}/{item.quantity})</>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {item.price && order.currency
                            ? `${order.currency} ${parseFloat(item.price).toFixed(2)}`
                            : "—"}
                        </p>
                        <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                        {/* Return action dialog */}
                        {showReturnDialog && (
                          <ReturnActionDialog
                            item={{
                              id: item.id,
                              title: item.title,
                              sku: item.sku,
                              quantity: item.quantity,
                              returnQuantity: item.returnQuantity,
                              returnDisposition: item.returnDisposition,
                              productId: item.productId,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-between">
              <span className="font-semibold text-gray-700">Order Total</span>
              <span className="font-bold text-gray-900">
                {order.currency && order.totalAmount
                  ? `${order.currency} ${parseFloat(order.totalAmount).toFixed(2)}`
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Buyer Info */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-800">Customer</h2>
            </div>
            <div className="px-4 py-3 text-sm space-y-1 text-gray-600">
              <p className="font-medium text-gray-900">
                {order.buyerName ?? "Anonymized by Amazon"}
              </p>
              {order.buyerEmail && <p className="text-gray-500">{order.buyerEmail}</p>}
              {rawOrder?.FulfillmentChannel && (
                <p className="text-xs mt-2">
                  <span className="font-medium">Fulfilled by: </span>
                  {rawOrder.FulfillmentChannel === "AFN" ? "Amazon (FBA)" : "Merchant (FBM)"}
                </p>
              )}
              {rawOrder?.ShipmentServiceLevelCategory && (
                <p className="text-xs">
                  <span className="font-medium">Shipping: </span>
                  {rawOrder.ShipmentServiceLevelCategory}
                </p>
              )}
            </div>
          </div>

          {/* Shipping Address */}
          {addr && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-4 py-3 border-b">
                <h2 className="text-sm font-semibold text-gray-800">Shipping Address</h2>
              </div>
              <div className="px-4 py-3 text-sm text-gray-600 space-y-0.5">
                {addr.Name && <p className="font-medium text-gray-900">{addr.Name}</p>}
                {addr.AddressLine1 && <p>{addr.AddressLine1}</p>}
                {addr.AddressLine2 && <p>{addr.AddressLine2}</p>}
                {(addr.City || addr.StateOrRegion) && (
                  <p>{[addr.City, addr.StateOrRegion].filter(Boolean).join(", ")}</p>
                )}
                {addr.PostalCode && <p>{addr.PostalCode}</p>}
                {addr.CountryCode && <p className="font-medium">{addr.CountryCode}</p>}
                {addr.Phone && <p className="text-gray-400 text-xs mt-1">{addr.Phone}</p>}
              </div>
            </div>
          )}

          {/* Order Meta */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-800">Order Details</h2>
            </div>
            <div className="px-4 py-3 text-xs text-gray-500 space-y-2">
              <div className="flex justify-between">
                <span>Items Shipped</span>
                <span className="font-medium text-gray-800">
                  {rawOrder?.NumberOfItemsShipped ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Items Unshipped</span>
                <span className="font-medium text-gray-800">
                  {rawOrder?.NumberOfItemsUnshipped ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Channel</span>
                <span className="font-medium text-gray-800">{order.channelName}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
