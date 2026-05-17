"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

interface BulkSyncModalProps<TItem, TSummary> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmation: ReactNode;
  items: TItem[];
  initialSummary: TSummary;
  processItem: (item: TItem, index: number) => Promise<TSummary>;
  mergeSummary: (summary: TSummary, itemSummary: TSummary) => TSummary;
  getItemLabel: (item: TItem) => string;
  getSuccessDescription: (summary: TSummary, total: number) => string;
  onSuccessComplete: () => void;
  completedToastTitle?: string;
  completedMessage?: string;
  cancelToastTitle?: string;
  startLabel?: string;
  syncingLabel?: string;
  delayMs?: number;
  blockUnloadMessage?: string;
}

export function BulkSyncModal<TItem, TSummary>({
  open,
  onOpenChange,
  title,
  description,
  confirmation,
  items,
  initialSummary,
  processItem,
  mergeSummary,
  getItemLabel,
  getSuccessDescription,
  onSuccessComplete,
  completedToastTitle = "Bulk sync completed",
  completedMessage = "Successfully processed queue.",
  cancelToastTitle = "Bulk sync cancelled.",
  startLabel = "Start Sync",
  syncingLabel = "Syncing...",
  delayMs = 300,
  blockUnloadMessage = "Sync in progress. Are you sure you want to leave?",
}: BulkSyncModalProps<TItem, TSummary>) {
  const router = useRouter();
  const initialStatus = {
    isSyncing: false,
    progress: 0,
    currentItemLabel: null as string | null,
    cancelRequested: false,
    completed: false,
  };
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (status.isSyncing) {
        event.preventDefault();
        event.returnValue = blockUnloadMessage;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [blockUnloadMessage, status.isSyncing]);

  useEffect(() => {
    if (!open || !status.isSyncing || status.completed || status.cancelRequested) return;

    let isCancelled = false;

    const processQueue = async () => {
      let summary = initialSummary;

      for (const [index, item] of items.entries()) {
        if (isCancelled || status.cancelRequested) break;

        setStatus((prev) => ({ ...prev, currentItemLabel: getItemLabel(item) }));

        if (index > 0 && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        const itemSummary = await processItem(item, index);
        summary = mergeSummary(summary, itemSummary);
        setStatus((prev) => ({ ...prev, progress: index + 1 }));
      }

      if (!isCancelled) {
        setStatus((prev) => ({
          ...prev,
          isSyncing: false,
          completed: true,
          currentItemLabel: null,
        }));
        toast.success(completedToastTitle, {
          description: getSuccessDescription(summary, items.length),
        });
        router.refresh();
      }
    };

    processQueue();

    return () => {
      isCancelled = true;
    };
  }, [
    completedToastTitle,
    delayMs,
    getItemLabel,
    getSuccessDescription,
    initialSummary,
    items,
    mergeSummary,
    open,
    processItem,
    router,
    status.cancelRequested,
    status.completed,
    status.isSyncing,
  ]);

  const total = items.length;
  const progressPercent = total > 0 ? (status.progress / total) * 100 : 0;
  const isReadyToStart = !status.isSyncing && !status.completed && !status.cancelRequested && status.progress === 0;

  const handleCancel = () => {
    setStatus((prev) => ({ ...prev, cancelRequested: true, isSyncing: false }));
    toast.info(cancelToastTitle);
  };

  const handleClose = () => {
    if (!status.isSyncing) {
      onOpenChange(false);
      if (status.completed && !status.cancelRequested) onSuccessComplete();
      setStatus(initialStatus);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[425px]"
        onInteractOutside={(event) => {
          if (status.isSyncing) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-6">
          {isReadyToStart ? (
            <div className="text-sm text-muted-foreground">{confirmation}</div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>{status.isSyncing ? syncingLabel : status.completed ? "Finished" : "Preparing..."}</span>
                  <span className="tabular-nums">
                    {status.progress} / {total}
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>

              {status.isSyncing && status.currentItemLabel && (
                <div className="flex items-center gap-2 rounded-md border bg-muted p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  <span className="flex-1 truncate font-mono">{status.currentItemLabel}</span>
                </div>
              )}

              {status.completed && !status.cancelRequested && (
                <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{completedMessage}</span>
                </div>
              )}

              {status.cancelRequested && (
                <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Operation was manually cancelled.</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {isReadyToStart ? (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={() => setStatus((prev) => ({ ...prev, isSyncing: true }))} disabled={total === 0}>
                {startLabel}
              </Button>
            </>
          ) : status.isSyncing ? (
            <Button variant="destructive" onClick={handleCancel}>
              Cancel Remaining
            </Button>
          ) : (
            <Button onClick={handleClose}>Close</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
