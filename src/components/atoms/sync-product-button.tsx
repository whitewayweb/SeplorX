"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { getCatalogItem } from "@/app/(dashboard)/channels/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export interface SyncProductButtonProps {
    channelId: number;
    externalId: string;
    className?: string;
    onSuccess?: (productId?: number) => void;
    title?: string;
}

export function SyncProductButton({
    channelId,
    externalId,
    className,
    onSuccess,
    title = "Refetch from channel"
}: SyncProductButtonProps) {
    const [isRefetching, setIsRefetching] = useState(false);
    const router = useRouter();

    const handleRefetch = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsRefetching(true);
        try {
            const result = await getCatalogItem(channelId, externalId);
            if (result.error) {
                toast.error("Failed to refetch product", { description: result.error });
            } else {
                toast.success("Product refreshed", {
                    description: `"${result.product?.name ?? externalId}" has been updated.`,
                });

                const productId = result.product?.id;

                if (onSuccess && typeof productId === "number") {
                    onSuccess(productId);
                }
                router.refresh();
            }
        } catch (err) {
            toast.error("Failed to refetch product", { description: String(err) });
        } finally {
            setIsRefetching(false);
        }
    };

    return (
        <Button
            variant="ghost"
            size="icon"
            className={className || "h-7 w-7"}
            onClick={handleRefetch}
            disabled={isRefetching}
            title={title}
        >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
        </Button>
    );
}
