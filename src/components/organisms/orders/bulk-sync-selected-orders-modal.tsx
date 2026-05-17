"use client";

import { smartSyncSelectedOrderAction } from "@/app/(dashboard)/orders/actions";
import { BulkSyncModal } from "@/components/molecules/bulk-sync-modal";

interface SelectedOrder {
  id: number;
  externalOrderId: string | null;
}

interface BulkSyncSelectedOrdersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedOrders: SelectedOrder[];
  onSuccessComplete: () => void;
}

interface SelectedOrderSyncSummary {
  ordersFetched: number;
  ordersUpdated: number;
  orderFailures: number;
  financeSynced: number;
  financeNoData: number;
  financeSkipped: number;
  financeFailures: number;
}

const INITIAL_SUMMARY: SelectedOrderSyncSummary = {
  ordersFetched: 0,
  ordersUpdated: 0,
  orderFailures: 0,
  financeSynced: 0,
  financeNoData: 0,
  financeSkipped: 0,
  financeFailures: 0,
};

export function BulkSyncSelectedOrdersModal({
  open,
  onOpenChange,
  selectedOrders,
  onSuccessComplete,
}: BulkSyncSelectedOrdersModalProps) {
  return (
    <BulkSyncModal
      open={open}
      onOpenChange={onOpenChange}
      title="Sync Selected Orders"
      description="Refresh selected orders from their channel, then sync finance where the refreshed order state supports it."
      confirmation={
        <>
          You have selected <strong>{selectedOrders.length}</strong> order{selectedOrders.length === 1 ? "" : "s"}. Each
          order will be refreshed individually, then finance will sync when it is ready and not already complete.
        </>
      }
      items={selectedOrders}
      initialSummary={INITIAL_SUMMARY}
      getItemLabel={(order) => order.externalOrderId ?? `#${order.id}`}
      syncingLabel="Syncing order..."
      completedToastTitle="Selected orders synced"
      getSuccessDescription={(summary, total) =>
        `${total} selected. Orders: ${summary.ordersFetched} fetched, ${summary.ordersUpdated} updated, ${summary.orderFailures} failed. Finance: ${summary.financeSynced} synced, ${summary.financeNoData} no data, ${summary.financeSkipped} skipped, ${summary.financeFailures} failed.`
      }
      processItem={async (order) => {
        const result = await smartSyncSelectedOrderAction(order.id);
        if (!result.success) {
          return {
            ...INITIAL_SUMMARY,
            orderFailures: 1,
          };
        }

        return {
          ordersFetched: result.orderSync.fetched,
          ordersUpdated: result.orderSync.updated,
          orderFailures: result.orderSync.failed,
          financeSynced: result.financeSync.synced,
          financeNoData: result.financeSync.noData,
          financeSkipped: result.financeSync.skipped,
          financeFailures: result.financeSync.failed,
        };
      }}
      mergeSummary={(summary, itemSummary) => ({
        ordersFetched: summary.ordersFetched + itemSummary.ordersFetched,
        ordersUpdated: summary.ordersUpdated + itemSummary.ordersUpdated,
        orderFailures: summary.orderFailures + itemSummary.orderFailures,
        financeSynced: summary.financeSynced + itemSummary.financeSynced,
        financeNoData: summary.financeNoData + itemSummary.financeNoData,
        financeSkipped: summary.financeSkipped + itemSummary.financeSkipped,
        financeFailures: summary.financeFailures + itemSummary.financeFailures,
      })}
      onSuccessComplete={onSuccessComplete}
    />
  );
}
