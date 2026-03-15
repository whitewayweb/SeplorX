"use client";

import { useTransition } from "react";
import { PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncChannelProducts } from "@/app/(dashboard)/channels/actions";

interface SyncProductsButtonProps {
    channelId: number;
}

export function SyncProductsButton({ channelId }: SyncProductsButtonProps) {
    const [pending, startTransition] = useTransition();

    function handleFetch() {
        startTransition(async () => {
            const res = await syncChannelProducts(channelId);
            if (res.error) {
                toast.error("Fetch failed", { description: res.error });
            } else {
                toast.success("Products Synced", {
                    description: `Successfully cached ${res.count} products from this channel.`,
                });
            }
        });
    }

    return (
        <Button
            variant="outline"
            onClick={handleFetch}
            disabled={pending}
            title="Fetch products from this channel"
        >
            <PackageSearch className="h-4 w-4 mr-2" />
            {pending ? "Fetching…" : "Sync Products"}
        </Button>
    );
}
