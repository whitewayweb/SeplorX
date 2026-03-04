"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getCatalogItem } from "@/app/channels/actions";

interface RefetchProductButtonProps {
    channelId: number;
    externalId: string;
}

export function RefetchProductButton({ channelId, externalId }: RefetchProductButtonProps) {
    const [pending, startTransition] = useTransition();

    function handleRefetch() {
        startTransition(async () => {
            const result = await getCatalogItem(channelId, externalId);
            if (result.error) {
                toast.error("Failed to refetch product", { description: result.error });
            } else {
                toast.success("Product refreshed", {
                    description: `"${result.product?.name ?? externalId}" has been updated.`,
                });
            }
        });
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleRefetch}
            disabled={pending}
            title="Refetch from channel"
        >
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
        </Button>
    );
}
