import type { FinanceSyncStatus, SalesOrderStatus } from "@/db/schema";

export const FINANCE_ELIGIBLE_ORDER_STATUSES = [
  "shipped",
  "delivered",
  "returned",
  "refunded",
] as const satisfies readonly SalesOrderStatus[];

export const FINANCE_RETRYABLE_SYNC_STATUSES = [
  "pending",
  "no_data",
  "failed",
] as const satisfies readonly FinanceSyncStatus[];

export function isFinanceEligibleOrderStatus(
  status: string | null | undefined,
): status is (typeof FINANCE_ELIGIBLE_ORDER_STATUSES)[number] {
  return (FINANCE_ELIGIBLE_ORDER_STATUSES as readonly string[]).includes(
    status ?? "",
  );
}

export function isRetryableFinanceSyncStatus(
  status: string | null | undefined,
): status is (typeof FINANCE_RETRYABLE_SYNC_STATUSES)[number] {
  return (FINANCE_RETRYABLE_SYNC_STATUSES as readonly string[]).includes(
    status ?? "",
  );
}

export function shouldSyncOrderFinance(
  orderStatus: string | null | undefined,
  financeSyncStatus: string | null | undefined,
): boolean {
  if (
    !isFinanceEligibleOrderStatus(orderStatus) &&
    !isRetryableFinanceSyncStatus(financeSyncStatus)
  ) {
    return false;
  }

  return financeSyncStatus !== "synced" && financeSyncStatus !== "not_supported";
}

export function getFinanceSkipReason(
  orderStatus: string | null | undefined,
  financeSyncStatus: string | null | undefined,
): string | null {
  if (
    !isFinanceEligibleOrderStatus(orderStatus) &&
    !isRetryableFinanceSyncStatus(financeSyncStatus)
  ) {
    return "not ready";
  }

  if (financeSyncStatus === "synced") return "already synced";
  if (financeSyncStatus === "not_supported") return "not supported";
  return null;
}
