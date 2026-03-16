import { db } from "@/db";
import { salesOrders, salesOrderItems, channels } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Types matching the Amazon SP-API rawData structure we store
interface AmazonOrderRaw {
  AmazonOrderId?: string;
  OrderStatus?: string;
  PurchaseDate?: string;
  OrderTotal?: { Amount?: string; CurrencyCode?: string };
  FulfillmentChannel?: string;
  ShipmentServiceLevelCategory?: string;
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
}

interface AmazonBuyerInfoRaw {
  BuyerName?: string;
  BuyerEmail?: string;
}

interface AmazonAddressRaw {
  ShippingAddress?: {
    Name?: string;
    AddressLine1?: string;
    AddressLine2?: string;
    City?: string;
    StateOrRegion?: string;
    PostalCode?: string;
    CountryCode?: string;
    Phone?: string;
  };
}

interface AmazonItemRaw {
  Title?: string;
  ASIN?: string;
  SellerSKU?: string;
  QuantityOrdered?: number;
  ItemPrice?: { Amount?: string; CurrencyCode?: string };
  ItemTax?: { Amount?: string; CurrencyCode?: string };
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const orderIdNum = parseInt(orderId, 10);

  if (isNaN(orderIdNum)) notFound();

  const [order] = await db
    .select({
      id: salesOrders.id,
      externalOrderId: salesOrders.externalOrderId,
      status: salesOrders.status,
      totalAmount: salesOrders.totalAmount,
      currency: salesOrders.currency,
      buyerName: salesOrders.buyerName,
      buyerEmail: salesOrders.buyerEmail,
      purchasedAt: salesOrders.purchasedAt,
      rawData: salesOrders.rawData,
      channelId: salesOrders.channelId,
      channelName: channels.name,
    })
    .from(salesOrders)
    .leftJoin(channels, eq(salesOrders.channelId, channels.id))
    .where(eq(salesOrders.id, orderIdNum))
    .limit(1);

  if (!order) notFound();

  const items = await db
    .select()
    .from(salesOrderItems)
    .where(eq(salesOrderItems.orderId, orderIdNum));

  // Extract typed rawData
  const raw = order.rawData as { order?: AmazonOrderRaw; buyerInfo?: AmazonBuyerInfoRaw; shippingAddress?: AmazonAddressRaw } | null;
  const addr = raw?.shippingAddress?.ShippingAddress;
  const rawOrder = raw?.order;

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
              {order.purchasedAt?.toLocaleDateString("en-IN", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          </div>
          <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
            order.status === "shipped"   ? "bg-green-100 text-green-800"  :
            order.status === "cancelled" ? "bg-red-100 text-red-800"     :
            order.status === "returned"  ? "bg-orange-100 text-orange-800":
                                           "bg-yellow-100 text-yellow-800"
          }`}>
            {order.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Order Items */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-800">Order Items ({items.length})</h2>
            </div>
            <div className="divide-y">
              {items.map((item) => {
                const rawItem = item.rawData as AmazonItemRaw | null;
                return (
                  <div key={item.id} className="px-6 py-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm leading-snug">
                          {item.title ?? rawItem?.Title ?? "Unknown product"}
                        </p>
                        <div className="flex gap-3 mt-1">
                          {item.sku && (
                            <span className="text-xs text-gray-400">SKU: {item.sku}</span>
                          )}
                          {(rawItem?.ASIN) && (
                            <span className="text-xs text-gray-400">ASIN: {rawItem.ASIN}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {item.price && order.currency
                            ? `${order.currency} ${parseFloat(item.price).toFixed(2)}`
                            : "—"}
                        </p>
                        <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
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

        {/* Sidebar: buyer + shipping */}
        <div className="space-y-4">
          {/* Buyer Info */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-800">Customer</h2>
            </div>
            <div className="px-4 py-3 text-sm space-y-1 text-gray-600">
              <p className="font-medium text-gray-900">{order.buyerName ?? "Anonymized by Amazon"}</p>
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
                <span className="font-medium text-gray-800">{rawOrder?.NumberOfItemsShipped ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>Items Unshipped</span>
                <span className="font-medium text-gray-800">{rawOrder?.NumberOfItemsUnshipped ?? "—"}</span>
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
