"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
    pollChannelProductFetchJob,
    startChannelProductFetchJob,
} from "@/app/(dashboard)/channels/actions";
import { cn } from "@/lib/utils";

interface SyncProductsButtonProps {
    channelId: number;
    size?: "default" | "sm";
    compact?: boolean;
}

interface ProductFetchJob {
    id: number;
    channelId: number;
    status: string;
    phase: string;
    totalCount: number;
    importedCount: number;
    enrichedCount: number;
    failedCount: number;
    skippedCount: number;
    errorMessage: string | null;
    recentItems: Array<{
        id: number;
        externalId: string;
        sku: string | null;
        status: string;
        errorMessage: string | null;
    }>;
}

export function SyncProductsButton({
    channelId,
    size = "default",
    compact = false,
}: SyncProductsButtonProps) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [job, setJob] = useState<ProductFetchJob | null>(null);
    const [isPolling, setIsPolling] = useState(false);

    const isRunning = !!job && isRunningStatus(job.status);

    useEffect(() => {
        if (!job || !isRunningStatus(job.status)) return;

        let cancelled = false;
        const timeout = setTimeout(async () => {
            setIsPolling(true);
            try {
                const previousImportedCount = job.importedCount;
                const result = await pollChannelProductFetchJob(job.id);
                if (cancelled) return;

                if (result.error) {
                    toast.error("Could not update fetch progress", { description: result.error });
                    setJob((current) => current ? { ...current, status: "failed", errorMessage: result.error } : current);
                    return;
                }

                if (!result.success || !result.job) {
                    toast.error("Could not update fetch progress");
                    return;
                }

                const nextJob = result.job;
                setJob(nextJob);

                if (nextJob.importedCount > previousImportedCount) {
                    router.refresh();
                }

                if (nextJob.status === "done") {
                    toast.success("Products fetched", {
                        description: `${nextJob.importedCount} imported, ${nextJob.failedCount} enrichment failures.`,
                    });
                    router.refresh();
                } else if (nextJob.status === "failed") {
                    toast.error("Fetch failed", {
                        description: nextJob.errorMessage ?? "The product fetch job failed.",
                    });
                }
            } finally {
                if (!cancelled) setIsPolling(false);
            }
        }, getPollDelay(job));

        return () => {
            cancelled = true;
            clearTimeout(timeout);
        };
    }, [job, router]);

    function handleFetch() {
        startTransition(async () => {
            const res = await startChannelProductFetchJob(channelId);
            if (res.error) {
                toast.error("Fetch failed", { description: res.error });
            } else {
                if (!res.success || !res.job) {
                    toast.error("Fetch failed");
                    return;
                }
                setJob(res.job);
                toast.info("Product fetch started", {
                    description: "The channel will update as Amazon report data becomes available.",
                });
            }
        });
    }

    return (
        <div className={cn(compact ? "space-y-2 max-w-[260px]" : "relative inline-flex")}>
            <Button
                variant="outline"
                size={size}
                onClick={handleFetch}
                disabled={pending || isRunning}
                title="Fetch products from this channel"
            >
                {isRunning ? (
                    <Loader2 className={cn("mr-2 animate-spin", size === "sm" ? "h-3 w-3" : "h-4 w-4")} />
                ) : (
                    <PackageSearch className={cn("mr-2", size === "sm" ? "h-3 w-3" : "h-4 w-4")} />
                )}
                {pending ? "Starting…" : isRunning ? "Fetching…" : "Fetch Products"}
            </Button>

            {job && (
                <ProductFetchProgress job={job} isPolling={isPolling} compact={compact} />
            )}
        </div>
    );
}

function ProductFetchProgress({
    job,
    isPolling,
    compact,
}: {
    job: ProductFetchJob;
    isPolling: boolean;
    compact: boolean;
}) {
    const completed = job.enrichedCount + job.failedCount + job.skippedCount;
    const progress = job.totalCount > 0
        ? Math.round((completed / job.totalCount) * 100)
        : job.importedCount > 0
            ? 25
            : 5;
    const running = isRunningStatus(job.status);
    const failedItems = job.recentItems.filter((item) => item.status === "failed").slice(0, compact ? 1 : 3);
    const statusTone = getStatusTone(job);

    return (
        <div className={cn(
            "border text-xs shadow-sm",
            compact
                ? "w-full rounded-md p-2"
                : "absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[360px] rounded-lg bg-white p-3",
            statusTone,
        )}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-semibold leading-5">{getJobLabel(job)}</p>
                    {!compact && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {getJobDescription(job)}
                        </p>
                    )}
                </div>
                {running ? (
                    <Loader2 className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", isPolling && "animate-spin")} />
                ) : job.status === "done" ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
            </div>
            {running && <Progress value={progress} className="mt-2 h-1.5" />}
            <div className={cn(
                "mt-2 grid gap-2 text-[11px]",
                compact ? "grid-cols-1" : "grid-cols-3",
            )}>
                <StatusMetric label="Imported" value={job.importedCount} />
                {!compact && <StatusMetric label="Enriched" value={job.totalCount > 0 ? `${completed}/${job.totalCount}` : "-"} />}
                {!compact && <StatusMetric label="Failed" value={job.failedCount} />}
            </div>
            {job.errorMessage && (
                <p className="mt-1 line-clamp-2 text-[11px]">{job.errorMessage}</p>
            )}
            {failedItems.length > 0 && (
                <div className="mt-2 space-y-1 border-t pt-2">
                    {failedItems.map((item) => (
                        <p key={item.id} className="truncate font-mono text-[11px]" title={item.errorMessage ?? undefined}>
                            {item.externalId}: {item.errorMessage ?? "Failed"}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}

function StatusMetric({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="rounded-md bg-background/70 px-2 py-1">
            <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
            <p className="font-medium tabular-nums">{value}</p>
        </div>
    );
}

function isRunningStatus(status: string) {
    return status === "queued" || status === "waiting_report" || status === "importing" || status === "enriching";
}

function getPollDelay(job: ProductFetchJob) {
    if (job.status === "waiting_report") return 5_000;
    if (job.status === "importing") return 2_000;
    return 2_500;
}

function getJobLabel(job: ProductFetchJob) {
    if (job.status === "failed") return "Product fetch failed";
    if (job.status === "done") return "Product fetch complete";
    if (job.phase === "waiting_report") return "Amazon is preparing the report";
    if (job.phase === "importing") return "Importing listings";
    if (job.phase === "enriching") return "Enriching details";
    return "Preparing fetch";
}

function getJobDescription(job: ProductFetchJob) {
    if (job.status === "failed") return job.errorMessage ?? "The fetch stopped before completion.";
    if (job.status === "done") return "The local product cache is up to date.";
    if (job.phase === "waiting_report") return "This usually takes a few minutes. You can keep working while it runs.";
    if (job.phase === "importing") return "New listings are being added to the local cache.";
    if (job.phase === "enriching") return "Images, relationships, FBA stock, and catalog details are being refreshed.";
    return "Starting product reconciliation.";
}

function getStatusTone(job: ProductFetchJob) {
    if (job.status === "failed") return "border-red-200 bg-red-50 text-red-900";
    if (job.status === "done") return "border-green-200 bg-green-50 text-green-900";
    return "border-blue-200 bg-blue-50 text-blue-950";
}
