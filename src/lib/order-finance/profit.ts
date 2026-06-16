/**
 * Collocated profit calculation logic shared across the order detail page
 * and order list pages. Any change here affects both views.
 *
 * Rules (see AGENTS.md → "Order Returns and Profit Calculation"):
 * - Cancelled/failed orders → product cost is 0.
 * - Restocked items → reduce cost by the restocked quantity (seller recovered asset).
 * - Unprocessed stock orders with refunds → proportionally reduce cost via refund ratio
 *   (legacy orders that predate inventory tracking, or orders never fulfilled).
 * - All other cases → full product cost is charged as an expense.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** Minimal item shape required for product cost calculation. */
export interface CostableItem {
  unitCost: string | null;
  quantity: number;
  returnQuantity: number;
  returnDisposition: string | null;
}

/** Finance summary shape required for profit calculation. */
export interface FinanceSummaryForProfit {
  principal: number;
  shippingRevenue: number;
  orderFeeRevenue: number;
  discount: number;
  marketplaceFee: number;
  paymentFee: number;
  other: number;
  withholding: number;
  refund: number;
  adjustment: number;
  tax: number;
  syncStatus: string | null;
}

export interface SellerFinanceView {
  salesRevenue: number;
  tax: number;
  amazonFees: number;
  marketplaceFee: number;
  paymentFee: number;
  otherFeesAndRebates: number;
  withholding: number;
  refunds: number;
  netBeforeProductCost: number;
}

export interface ProductCostResult {
  capturedCost: number;
  missingCostCount: number;
  costedItemCount: number;
}

export interface OrderProfitResult {
  estimatedProfit: number | null;
  estimatedSales: number | null;
  estimatedFees: number | null;
  estimatedCost: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseMoneyValue(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compute the raw product cost from order items, respecting restocked returns.
 *
 * For items with `returnDisposition === "restocked"`, the restocked quantity
 * is subtracted so the seller's recovered asset isn't double-counted as an expense.
 */
export function computeProductCost(items: CostableItem[]): ProductCostResult {
  return items.reduce(
    (total, item) => {
      const unitCost = parseMoneyValue(item.unitCost);
      if (unitCost === null) {
        return {
          ...total,
          missingCostCount: total.missingCostCount + 1,
        };
      }

      // If the item was physically returned and restocked into inventory,
      // the seller recovered the asset. Don't count the restocked units as an expense.
      const isRestocked = item.returnDisposition === "restocked";
      const effectiveQuantity = isRestocked
        ? Math.max(0, item.quantity - (item.returnQuantity ?? 0))
        : item.quantity;

      return {
        capturedCost: total.capturedCost + unitCost * effectiveQuantity,
        missingCostCount: total.missingCostCount,
        costedItemCount: total.costedItemCount + 1,
      };
    },
    { capturedCost: 0, missingCostCount: 0, costedItemCount: 0 },
  );
}

/**
 * Build the seller-facing finance view from a finance summary.
 * This structures the raw component totals into the revenue/fee/refund breakdown
 * the UI needs.
 */
export function buildSellerFinanceView(summary: FinanceSummaryForProfit): SellerFinanceView {
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

/**
 * Compute the effective product cost for an order, applying all business rules:
 * 1. Cancelled/failed → cost = 0
 * 2. Stock-processed orders → full raw cost (restocking already handled per-item)
 * 3. Non-stock-processed orders with refunds → proportionally reduce cost
 */
export function computeEffectiveProductCost(opts: {
  rawProductCost: number;
  orderStatus: string | null;
  stockProcessed: boolean;
  sellerFinance: SellerFinanceView | null;
}): number {
  const { rawProductCost, orderStatus, stockProcessed, sellerFinance } = opts;

  const isCancelledOrFailed = orderStatus === "cancelled" || orderStatus === "failed";
  if (isCancelledOrFailed) return 0;

  let effectiveCost = rawProductCost;

  // Legacy / Unprocessed Returns Heuristic:
  // If an order's physical stock was never processed by SeplorX (stockProcessed is false),
  // it either predates the inventory system or was never fulfilled from physical stock.
  // For these orders, we shouldn't require manual 'Restocked' UI actions. Instead, we
  // proportionally reduce the product cost based on the financial refund amount.
  if (!stockProcessed && sellerFinance && sellerFinance.refunds < 0) {
    const salesRevenue = sellerFinance.salesRevenue;
    if (salesRevenue > 0) {
      const refundRatio = Math.min(1, Math.abs(sellerFinance.refunds) / salesRevenue);
      effectiveCost = effectiveCost * (1 - refundRatio);
    }
  }

  return effectiveCost;
}

/**
 * All-in-one helper for list pages: given an order with items and a finance summary,
 * compute the profit/sales/fees/cost in a single call.
 *
 * Returns null fields when finance data is not available (un-synced orders).
 */
export function computeOrderProfit(opts: {
  orderStatus: string | null;
  stockProcessed: boolean;
  items: CostableItem[];
  financeSummary: FinanceSummaryForProfit | undefined;
}): OrderProfitResult {
  const { orderStatus, stockProcessed, items, financeSummary } = opts;

  const isCancelledOrFailed = orderStatus === "cancelled" || orderStatus === "failed";

  if (isCancelledOrFailed || !financeSummary || financeSummary.syncStatus !== "synced") {
    return { estimatedProfit: null, estimatedSales: null, estimatedFees: null, estimatedCost: null };
  }

  const sellerFinance = buildSellerFinanceView(financeSummary);

  const rawProductCost = computeProductCost(items).capturedCost;

  const effectiveCost = computeEffectiveProductCost({
    rawProductCost,
    orderStatus,
    stockProcessed,
    sellerFinance,
  });

  return {
    estimatedProfit: sellerFinance.netBeforeProductCost - effectiveCost,
    estimatedSales: sellerFinance.salesRevenue,
    estimatedFees: Math.abs(sellerFinance.amazonFees + sellerFinance.withholding + sellerFinance.refunds),
    estimatedCost: effectiveCost,
  };
}
