"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { getChannelProduct } from "@/app/(dashboard)/channels/actions";

export interface ChannelProductDetail {
    id: number;
    channelId: number;
    externalId: string;
    name: string;
    sku: string | null;
    type: string | null;
    stockQuantity: number | null;
    rawData: Record<string, unknown>;
    lastSyncedAt: Date | null;
    productUrl?: string | null;
}

/**
 * Manages product detail state with local caching to prevent redundant server calls.
 */
export function useChannelProductDetail() {
    const [cache, setCache] = useState<Map<number, ChannelProductDetail>>(new Map());
    const [selectedProduct, setSelectedProduct] = useState<ChannelProductDetail | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const openProduct = useCallback(
        async (productId: number) => {
            const cached = cache.get(productId);
            if (cached) {
                setSelectedProduct(cached);
                return;
            }

            setIsLoading(true);
            try {
                const result = await getChannelProduct(productId);
                if (result.success && result.product) {
                    const product = result.product as ChannelProductDetail;
                    setSelectedProduct(product);
                    setCache((prev) => new Map(prev).set(productId, product));
                } else {
                    toast.error("Failed to load product details", { description: result.error });
                    setSelectedProduct(null);
                }
            } catch (err) {
                console.error("[useChannelProductDetail]", { productId, error: String(err) });
                toast.error("An unexpected error occurred.");
                setSelectedProduct(null);
            } finally {
                setIsLoading(false);
            }
        },
        [cache],
    );

    const invalidate = useCallback((productId: number) => {
        setCache((prev) => {
            if (!prev.has(productId)) return prev;
            const next = new Map(prev);
            next.delete(productId);
            return next;
        });
    }, []);

    return {
        selectedProduct,
        isLoading,
        openProduct,
        invalidate,
    };
}
