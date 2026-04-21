"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { getCatalogItem } from "@/app/(dashboard)/channels/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface BulkSyncProductsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId: number;
    selectedExternalIds: string[];
    onSuccessComplete: () => void;
}

export function BulkSyncProductsModal({
    open,
    onOpenChange,
    channelId,
    selectedExternalIds,
    onSuccessComplete,
}: BulkSyncProductsModalProps) {
    const router = useRouter();
    const [isSyncing, setIsSyncing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentExternalId, setCurrentExternalId] = useState<string | null>(null);
    const [cancelRequested, setCancelRequested] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [prevOpen, setPrevOpen] = useState(open);

    // Reset state when opening by deriving state during render (avoids setState in effect)
    if (open !== prevOpen) {
        setPrevOpen(open);
        if (open) {
            setIsSyncing(false);
            setProgress(0);
            setCancelRequested(false);
            setCompleted(false);
            setCurrentExternalId(null);
        }
    }

    // Protect against browser navigation
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isSyncing) {
                e.preventDefault();
                e.returnValue = "Sync in progress. Are you sure you want to leave?";
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isSyncing]);

    // The orchestration queue
    useEffect(() => {
        if (!open || !isSyncing || completed || cancelRequested) return;

        let isCancelled = false;

        const processQueue = async () => {
            let successCount = 0;
            let currentIdx = 0;

            for (const externalId of selectedExternalIds) {
                if (isCancelled || cancelRequested) break;
                
                setCurrentExternalId(externalId);
                try {
                    // Small delay to be polite to the API rate limits
                    if (currentIdx > 0) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                    
                    const result = await getCatalogItem(channelId, externalId);
                    if (!result.error) {
                        successCount++;
                    } else {
                        // Rate limit fallback: wait slightly longer and retry once
                        console.warn(`Error on ${externalId}:`, result.error);
                        if (String(result.error).includes("429")) {
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            await getCatalogItem(channelId, externalId);
                        }
                    }
                } catch (error) {
                    console.error("Failed to sync", externalId, error);
                }

                currentIdx++;
                setProgress(currentIdx);
            }

            if (!isCancelled) {
                setIsSyncing(false);
                setCompleted(true);
                toast.success(`Completed bulk sync. Successful: ${successCount}/${selectedExternalIds.length}`);
                router.refresh();
            }
        };

        processQueue();

        return () => {
            isCancelled = true;
        };
    }, [open, isSyncing, selectedExternalIds, channelId, router, cancelRequested, completed]);

    const total = selectedExternalIds.length;
    const progressPercent = total > 0 ? (progress / total) * 100 : 0;

    const handleCancel = () => {
        setCancelRequested(true);
        setIsSyncing(false);
        setCompleted(true);
        toast.info("Bulk sync cancelled.");
    };

    const handleClose = () => {
        if (!isSyncing) {
            onOpenChange(false);
            if (completed) onSuccessComplete();
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => {
                if (isSyncing) e.preventDefault(); // Prevent closing by clicking outside
            }}>
                <DialogHeader>
                    <DialogTitle>Bulk Sync Products</DialogTitle>
                    <DialogDescription>
                        Fetching updated details from the respective channel.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 flex flex-col gap-6">
                    {!isSyncing && !completed && !cancelRequested && progress === 0 ? (
                        <div className="text-sm text-muted-foreground">
                            You have selected <strong>{total}</strong> products to sync. This process will fetch the most up-to-date information directly from the channel and may take some time depending on the number of products. Ensure you do not close this window during the sync.
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm font-medium">
                                    <span>
                                        {isSyncing ? "Syncing..." : completed ? "Finished" : "Preparing..."}
                                    </span>
                                    <span className="tabular-nums">{progress} / {total}</span>
                                </div>
                                <Progress value={progressPercent} className="h-2" />
                            </div>

                            {isSyncing && currentExternalId && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-md border">
                                    <Loader2 className="w-4 h-4 animate-spin shrink-0 text-primary" />
                                    <span className="truncate flex-1 font-mono">{currentExternalId}</span>
                                </div>
                            )}

                            {completed && !cancelRequested && (
                                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-md border border-green-200">
                                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                                    <span>Successfully processed queue.</span>
                                </div>
                            )}
                            
                            {cancelRequested && (
                                <div className="flex items-center gap-2 text-sm text-yellow-700 bg-yellow-50 p-3 rounded-md border border-yellow-200">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>Operation was manually cancelled.</span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2">
                    {!isSyncing && !completed && !cancelRequested && progress === 0 ? (
                        <>
                            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                            <Button onClick={() => setIsSyncing(true)}>Start Sync</Button>
                        </>
                    ) : isSyncing ? (
                        <Button variant="destructive" onClick={handleCancel}>
                            Cancel Remaining
                        </Button>
                    ) : (
                        <Button onClick={handleClose}>
                            Close
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
