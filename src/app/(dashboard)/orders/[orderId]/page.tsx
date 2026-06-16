import { getAuthenticatedUserId } from "@/lib/auth";
import { getOrderDetail, getOrderItems } from "@/lib/orders/queries";
import { getReservationsForOrder, getReturnItemsForOrder } from "@/data/stock";
import {
  getOrderFinanceComponentBreakdown,
  getOrderFinanceSummary,
} from "@/lib/order-finance/service";
import { getChannelById } from "@/lib/channels/registry";
import { getChannelForUser } from "@/lib/channels/queries";
import { getChannelTimeZone, getChannelLocale } from "@/lib/channels/utils";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CircleHelp, Lock, RotateCcw } from "lucide-react";
import type { OrdersV0Schema } from "@/lib/channels/amazon/api/types/ordersV0Schema";
import { ReturnActionDialog } from "@/components/organisms/orders/return-action-dialog";
import { formatChannelDateTime, formatChannelDateTimeLong } from "@/lib/utils";
import { SyncFinancesButton } from "@/components/organisms/orders/sync-finances-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const dynamic = "force-dynamic";

const RETURN_DISPOSITION_BADGES: Record<string, { label: string; className: string }> = {
  pending_inspection: { label: "Pending Inspection", className: "bg-amber-100 text-amber-800" },
  restocked: { label: "Restocked", className: "bg-green-100 text-green-800" },
  discarded: { label: "Discarded", className: "bg-red-100 text-red-800" },
};

const FINANCE_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
  synced: { label: "Synced", className: "bg-green-100 text-green-800" },
  no_data: { label: "No data", className: "bg-gray-100 text-gray-700" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  not_supported: { label: "Not supported", className: "bg-gray-100 text-gray-700" },
};

function formatMoney(currency: string | null, amount: number): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency ?? "GBP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency ?? ""} ${amount.toFixed(2)}`.trim();
  }
}

function HelpTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <CircleHelp className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
      </TooltipTrigger>
      <TooltipContent className="max-w-72 leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function shouldShowFinanceSummaryRow(amount: number): boolean {
  return Math.abs(amount) > 0.004;
}

function getFinanceCodeDescription(role: string): string {
  if (role === "marketplace_fee") return "Amazon marketplace fee";
  if (role === "payment_fee") return "Payment or settlement fee";
  if (role === "other") return "Rebate, reversal, or other settlement entry";
  return "Settlement entry";
}

function parseMoneyValue(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getOrderProductCost(
  items: Awaited<ReturnType<typeof getOrderItems>>,
): {
  capturedCost: number;
  missingCostCount: number;
  costedItemCount: number;
} {
  return items.reduce(
    (total, item) => {
      const unitCost = parseMoneyValue(item.unitCost);
      if (unitCost === null) {
        return {
          ...total,
          missingCostCount: total.missingCostCount + 1,
        };
      }

      return {
        capturedCost: total.capturedCost + unitCost * item.quantity,
        missingCostCount: total.missingCostCount,
        costedItemCount: total.costedItemCount + 1,
      };
    },
    { capturedCost: 0, missingCostCount: 0, costedItemCount: 0 },
  );
}

function getSellerFinanceView(summary: NonNullable<Awaited<ReturnType<typeof getOrderFinanceSummary>>>) {
  const salesRevenue =
    summary.principal +
    summary.shippingRevenue +
    summary.orderFeeRevenue +
    summary.discount;
  const amazonFees =
    summary.marketplaceFee +
    summary.paymentFee +
    summary.other;
  const withholding = summary.withholding;
  const refunds = summary.refund + summary.adjustment;
  const netBeforeProductCost = salesRevenue + amazonFees + withholding + refunds;

  return {
    salesRevenue,
    tax: summary.tax,
    amazonFees,
    marketplaceFee: summary.marketplaceFee,
    paymentFee: summary.paymentFee,
    otherFeesAndRebates: summary.other,
    withholding,
    refunds,
    netBeforeProductCost,
  };
}

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

  const [items, reservations, returnItems, financeSummary, financeBreakdown, channelObj] = await Promise.all([
    getOrderItems(userId, orderIdNum),
    getReservationsForOrder(orderIdNum),
    order.status === "returned" ? getReturnItemsForOrder(orderIdNum) : Promise.resolve([]),
    getOrderFinanceSummary(userId, orderIdNum),
    getOrderFinanceComponentBreakdown(userId, orderIdNum),
    getChannelForUser(userId, order.channelId)
  ]);
  
  const timeZone = channelObj ? await getChannelTimeZone(channelObj.channelType, channelObj.credentials) : "UTC";
  const locale = channelObj ? await getChannelLocale(channelObj.channelType, channelObj.credentials) : "en-US";

  // Read from the narrowed JSONB fields directly
  const rawOrder = order.rawOrder;
  const addr = order.shippingAddress?.ShippingAddress;

  const unmatchedItemCount = items.filter((i) => i.productId === null).length;
  const isReturned = order.status === "returned";
  const returnDisposition = order.returnDisposition;
  const channelDefinition = getChannelById(order.channelType);
  const canSyncFinances = channelDefinition?.capabilities?.canSyncOrderFinances === true;
  const financeStatus = financeSummary?.syncStatus ?? "pending";
  const financeBadge = FINANCE_STATUS_BADGES[financeStatus] ?? FINANCE_STATUS_BADGES.pending;
  const productCost = getOrderProductCost(items);
  const sellerFinance = financeSummary ? getSellerFinanceView(financeSummary) : null;
  const amazonFeeBreakdown = financeBreakdown.filter((row) =>
    row.amountRole === "marketplace_fee" ||
    row.amountRole === "payment_fee" ||
    row.amountRole === "other"
  );
  const isCancelledOrFailed = order.status === "cancelled" || order.status === "failed";
  const effectiveProductCost = isCancelledOrFailed ? 0 : productCost.capturedCost;

  const estimatedOperatingProfit = sellerFinance
    ? sellerFinance.netBeforeProductCost - effectiveProductCost
    : null;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/orders/channels/${order.channelId}`}
          prefetch={false}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {order.channelName} Orders
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold font-mono">{order.externalOrderId}</h1>
            <p className="text-gray-500 mt-0.5">
              {formatChannelDateTimeLong(order.purchasedAt, timeZone, locale)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 text-sm font-semibold rounded-full ${order.status === "shipped" ? "bg-green-100 text-green-800" :
              order.status === "cancelled" ? "bg-red-100 text-red-800" :
                order.status === "returned" ? "bg-orange-100 text-orange-800" :
                  "bg-yellow-100 text-yellow-800"
              }`}>
              {order.status}
            </span>
            {isReturned && returnDisposition && (
              <span className={`px-3 py-1 text-sm font-semibold rounded-full ${RETURN_DISPOSITION_BADGES[returnDisposition]?.className ?? "bg-gray-100 text-gray-800"
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
                Order Items ({items.length})
              </h2>
              {unmatchedItemCount > 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  {unmatchedItemCount} item{unmatchedItemCount === 1 ? "" : "s"} not linked to a SeplorX product
                </p>
              )}
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
                                prefetch={false}
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
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RETURN_DISPOSITION_BADGES[itemDisposition]?.className ?? "bg-gray-100 text-gray-700"
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

          {/* ─── Returns Summary ─── */}
          {returnItems.length > 0 && (
            <div className="bg-white rounded-lg shadow mt-6 overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center justify-between bg-amber-50/30">
                <h2 className="font-semibold text-amber-900 flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-amber-600" />
                  Returns Summary
                </h2>
              </div>
              <div className="divide-y">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50/50">
                    <tr>
                      <th className="text-left py-2.5 px-6 font-medium text-amber-700/70 text-xs">Item</th>
                      <th className="text-right py-2.5 px-6 font-medium text-amber-700/70 text-xs">Returned Qty</th>
                      <th className="text-left py-2.5 px-6 font-medium text-amber-700/70 text-xs">Disposition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-amber-100">
                    {returnItems.map((ret) => (
                      ret.returnQuantity > 0 && (
                        <tr key={ret.id} className="hover:bg-amber-50/20">
                          <td className="py-3 px-6">
                            <div className="font-medium text-gray-900 line-clamp-1">{ret.title}</div>
                            <div className="text-xs text-gray-500 font-mono mt-0.5">{ret.sku}</div>
                          </td>
                          <td className="py-3 px-6 text-right font-mono font-semibold text-amber-700">{ret.returnQuantity}</td>
                          <td className="py-3 px-6">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RETURN_DISPOSITION_BADGES[ret.returnDisposition ?? ""]?.className ?? "bg-gray-100 text-gray-700"
                              }`}>
                              {RETURN_DISPOSITION_BADGES[ret.returnDisposition ?? ""]?.label ?? ret.returnDisposition ?? "Pending"}
                            </span>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── Order Economics ─── */}
          {sellerFinance && (
            <TooltipProvider>
              <div className="bg-white rounded-lg shadow mt-6 overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-gray-800">Order Economics</h2>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${financeBadge.className}`}>
                          {financeBadge.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 max-w-2xl">
                        Seller-facing profit view: sales proceeds minus Amazon deductions
                        and captured SeplorX product cost.
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Amazon finance synced {formatChannelDateTime(financeSummary?.syncedAt ?? null, timeZone, locale)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-gray-500">Estimated profit</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {formatMoney(order.currency, estimatedOperatingProfit ?? 0)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-5">
                  <div className="mb-5 grid gap-3 rounded-md border bg-gray-50 px-4 py-4 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center">
                    <div>
                      <div className="text-xs font-medium text-gray-500">Sale proceeds</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {formatMoney(order.currency, sellerFinance.salesRevenue)}
                      </div>
                    </div>
                    <div className="hidden text-gray-300 md:block">−</div>
                    <div>
                      <div className="text-xs font-medium text-gray-500">Amazon deductions</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {formatMoney(order.currency, Math.abs(sellerFinance.amazonFees + sellerFinance.withholding + sellerFinance.refunds))}
                      </div>
                    </div>
                    <div className="hidden text-gray-300 md:block">−</div>
                    <div>
                      <div className="text-xs font-medium text-gray-500">Product cost</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {formatMoney(order.currency, effectiveProductCost)}
                      </div>
                    </div>
                    <div className="hidden text-gray-300 md:block">=</div>
                    <div>
                      <div className="text-xs font-medium text-gray-500">Profit</div>
                      <div className="text-lg font-bold text-gray-900">
                        {formatMoney(order.currency, estimatedOperatingProfit ?? 0)}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-md border">
                    <div className="grid grid-cols-[1fr_auto] gap-4 border-b px-4 py-3 text-sm">
                      <div>
                        <div className="flex items-center gap-1 font-medium text-gray-900">
                          Sales revenue
                          <HelpTooltip text="Product, shipping, customer-facing fees, and discounts. Tax is excluded from profit and shown separately below." />
                        </div>
                        <div className="text-xs text-gray-500">What this order sold before Amazon deductions</div>
                      </div>
                      <div className="text-right font-semibold text-gray-900">
                        {formatMoney(order.currency, sellerFinance.salesRevenue)}
                      </div>
                    </div>
                    <details className="group border-b">
                      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] gap-4 px-4 py-3 text-sm hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
                        <div>
                          <div className="flex items-center gap-1 font-medium text-gray-900">
                            Amazon fees and rebates
                            <HelpTooltip text="Marketplace fees, payment fees, commission, closing fees, fulfillment fees, promo rebates, and fee reversals from settlement data." />
                          </div>
                          <div className="text-xs text-gray-500">
                            <span className="group-open:hidden">Settlement-side deductions or reversals · expand for breakdown</span>
                            <span className="hidden group-open:inline">Settlement-side deductions or reversals</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-gray-900">
                            {formatMoney(order.currency, sellerFinance.amazonFees)}
                          </div>
                          <div className="text-xs text-gray-400">
                            <span className="group-open:hidden">Expand</span>
                            <span className="hidden group-open:inline">Collapse</span>
                          </div>
                        </div>
                      </summary>
                      <div className="border-t bg-gray-50/60">
                        {amazonFeeBreakdown.map((entry) => (
                          <div key={`${entry.amountRole}:${entry.code}`} className="grid grid-cols-[1fr_auto] gap-4 border-b px-4 py-2.5 pl-8 text-sm last:border-b-0">
                            <div>
                              <div className="font-medium text-gray-800">{entry.code}</div>
                              <div className="text-xs text-gray-500">{getFinanceCodeDescription(entry.amountRole)}</div>
                            </div>
                            <div className="text-right font-medium text-gray-900">
                              {formatMoney(entry.currency ?? order.currency, entry.amount)}
                            </div>
                          </div>
                        ))}
                        {amazonFeeBreakdown.length === 0 && (
                          <div className="px-4 py-2.5 pl-8 text-sm text-gray-500">
                            No individual Amazon fee rows were saved for this order.
                          </div>
                        )}
                      </div>
                    </details>
                    <div className="grid grid-cols-[1fr_auto] gap-4 border-b px-4 py-3 text-sm">
                      <div>
                        <div className="flex items-center gap-1 font-medium text-gray-900">
                          Tax withheld
                          <HelpTooltip text="TDS/TCS or similar amounts held by Amazon. This affects settlement cash flow but is tracked separately from product cost." />
                        </div>
                        <div className="text-xs text-gray-500">Withholding from the finance event</div>
                      </div>
                      <div className="text-right font-semibold text-gray-900">
                        {formatMoney(order.currency, sellerFinance.withholding)}
                      </div>
                    </div>
                    {shouldShowFinanceSummaryRow(sellerFinance.refunds) && (
                      <div className="grid grid-cols-[1fr_auto] gap-4 border-b px-4 py-3 text-sm">
                        <div>
                          <div className="flex items-center gap-1 font-medium text-gray-900">
                            Refunds / adjustments
                            <HelpTooltip text="Refund and adjustment amounts from finance data. Negative values reduce the order contribution." />
                          </div>
                          <div className="text-xs text-gray-500">Customer refunds and provider adjustments</div>
                        </div>
                        <div className="text-right font-semibold text-gray-900">
                          {formatMoney(order.currency, sellerFinance.refunds)}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-[1fr_auto] gap-4 border-b bg-gray-50 px-4 py-3 text-sm">
                      <div>
                        <div className="font-medium text-gray-900">Order contribution before product cost</div>
                        <div className="text-xs text-gray-500">Sales revenue plus Amazon settlement deductions</div>
                      </div>
                      <div className="text-right font-semibold text-gray-900">
                        {formatMoney(order.currency, sellerFinance.netBeforeProductCost)}
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-l-4 border-blue-500 bg-blue-50/70 px-4 py-3 text-sm">
                      <div>
                        <div className="flex items-center gap-1 font-medium text-gray-900">
                          SeplorX product cost
                          <HelpTooltip text="Captured sales-order item unit cost multiplied by quantity. This uses the historical order cost snapshot, not current inventory valuation." />
                        </div>
                        <div className="text-xs text-gray-500">
                          {isCancelledOrFailed
                            ? "Product cost is zero for cancelled or failed orders"
                            : productCost.missingCostCount > 0
                            ? `${productCost.missingCostCount} item cost missing`
                            : "All order items have captured cost"}
                        </div>
                      </div>
                      <div className="text-right font-semibold text-gray-900">
                        {formatMoney(order.currency, -effectiveProductCost)}
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-4 bg-gray-50 px-4 py-3 text-sm">
                      <div>
                        <div className="font-semibold text-gray-900">Estimated operating profit</div>
                        <div className="text-xs text-gray-500">
                          Order contribution minus captured product cost
                        </div>
                      </div>
                      <div className="text-right text-lg font-bold text-gray-900">
                        {formatMoney(order.currency, estimatedOperatingProfit ?? 0)}
                      </div>
                    </div>
                  </div>

                  {shouldShowFinanceSummaryRow(sellerFinance.tax) && (
                    <div className="mt-3 text-xs text-gray-500">
                      Tax collected for reconciliation:{" "}
                      <span className="font-medium text-gray-700">
                        {formatMoney(order.currency, sellerFinance.tax)}
                      </span>
                      . It is excluded from estimated operating profit.
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                    <span>Amazon settlement data is saved for this order.</span>
                    {canSyncFinances && (
                      <SyncFinancesButton channelId={order.channelId} orderId={order.id} />
                    )}
                  </div>
                </div>
              </div>
            </TooltipProvider>
          )}

        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Stock Reservations */}
          {reservations.length > 0 && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-orange-500" />
                  Stock reserved
                </h2>
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                  {reservations.length} active
                </span>
              </div>
              <div className="divide-y">
                {reservations.map((res) => (
                  <div key={res.id} className="px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {res.productId ? (
                          <Link href={`/products/${res.productId}`} prefetch={false} className="group block">
                            <span className="line-clamp-2 font-medium text-blue-600 group-hover:underline">
                              {res.productName}
                            </span>
                          </Link>
                        ) : (
                          <span className="font-medium text-gray-900">Unmapped product</span>
                        )}
                        <div className="mt-1 text-xs font-mono text-gray-400">
                          {res.productSku ? `SKU: ${res.productSku}` : `ID: ${res.productId ?? "—"}`}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Reserved {formatChannelDateTime(res.createdAt, timeZone, locale)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs text-gray-500">Qty</div>
                        <div className="font-mono text-base font-semibold text-orange-600">
                          {res.quantity}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

        </div>
      </div>
    </div>
  );
}
