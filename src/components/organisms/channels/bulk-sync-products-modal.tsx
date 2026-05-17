"use client";

import { getCatalogItem } from "@/app/(dashboard)/channels/actions";
import { BulkSyncModal } from "@/components/molecules/bulk-sync-modal";

interface BulkSyncProductsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: number;
  selectedExternalIds: string[];
  onSuccessComplete: () => void;
}

interface ProductSyncSummary {
  successful: number;
}

const INITIAL_SUMMARY: ProductSyncSummary = { successful: 0 };

export function BulkSyncProductsModal({
  open,
  onOpenChange,
  channelId,
  selectedExternalIds,
  onSuccessComplete,
}: BulkSyncProductsModalProps) {
  return (
    <BulkSyncModal
      open={open}
      onOpenChange={onOpenChange}
      title="Bulk Sync Products"
      description="Fetching updated details from the respective channel."
      confirmation={
        <>
          You have selected <strong>{selectedExternalIds.length}</strong> products to sync. This process will fetch the
          most up-to-date information directly from the channel and may take some time depending on the number of
          products. Ensure you do not close this window during the sync.
        </>
      }
      items={selectedExternalIds}
      initialSummary={INITIAL_SUMMARY}
      getItemLabel={(externalId) => externalId}
      processItem={async (externalId) => {
        try {
          const result = await getCatalogItem(channelId, externalId);
          if (!result.error) return { successful: 1 };

          if (String(result.error).includes("429")) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await getCatalogItem(channelId, externalId);
          }
        } catch (error) {
          console.error("Failed to sync", externalId, error);
        }

        return { successful: 0 };
      }}
      mergeSummary={(summary, itemSummary) => ({
        successful: summary.successful + itemSummary.successful,
      })}
      getSuccessDescription={(summary, total) => `Successful: ${summary.successful}/${total}`}
      completedToastTitle="Completed bulk sync"
      cancelToastTitle="Bulk sync cancelled."
      onSuccessComplete={onSuccessComplete}
    />
  );
}
