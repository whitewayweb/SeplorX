"use client";

import { useState, useCallback, Fragment } from "react";
import { CornerDownRight, RefreshCw, Loader2, ChevronRight, ChevronDown, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductDetailTabs } from "./product-detail-tabs";
import { useChannelProductDetail } from "@/lib/channels/hooks/use-channel-product-detail";
import { SyncProductButton } from "@/components/atoms/sync-product-button";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface ProductRow {
    id: number;
    externalId: string;
    name: string;
    sku: string | null;
    type: string | null;
    stockQuantity: number | null;
    lastSyncedAt: Date | null;
    productUrl?: string | null;
    fulfillmentChannelCode?: string | null;
}

interface VariationRow extends ProductRow {
    parentId?: string;
}

interface ChannelProductsTableProps {
    channelId: number;
    channelName?: string;
    products: ProductRow[];
    variations: VariationRow[];
    canRefetchItem: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function ChannelProductsTable({
    channelId,
    channelName,
    products,
    variations,
    canRefetchItem,
}: ChannelProductsTableProps) {
    const router = useRouter();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

    const { selectedProduct, isLoading, openProduct, invalidate } = useChannelProductDetail();

    const toggleExpand = useCallback((e: React.MouseEvent, externalId: string) => {
        e.stopPropagation();
        setExpandedParents((prev) => {
            const next = new Set(prev);
            if (next.has(externalId)) {
                next.delete(externalId);
            } else {
                next.add(externalId);
            }
            return next;
        });
    }, []);

    // ── Interaction Handlers ────────────────────────────────────────────────

    const handleRowClick = useCallback(
        (productId: number) => {
            setDrawerOpen(true);
            openProduct(productId);
        },
        [openProduct],
    );

    // ── Helpers ─────────────────────────────────────────────────────────────

    const colSpan = canRefetchItem ? 6 : 5;



    // ── Render ──────────────────────────────────────────────────────────────

    return (
        <>
            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>External ID</TableHead>
                                <TableHead>Product Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">Stock</TableHead>
                                <TableHead className="text-right">Last Synced</TableHead>
                                {canRefetchItem && <TableHead className="w-[50px]"></TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {products.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
                                        No products synced yet. Go to Channels to fetch products.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                products.map((product) => {
                                    const productVariations = variations.filter(
                                        (v) => v.parentId === product.externalId
                                    );

                                    return (
                                        <Fragment key={product.id}>
                                            <TableRow
                                                className={`cursor-pointer hover:bg-muted/50 transition-colors ${productVariations.length > 0 && expandedParents.has(product.externalId) ? "border-b-0" : ""}`}
                                                onClick={() => handleRowClick(product.id)}
                                            >
                                                <TableCell className="whitespace-nowrap">
                                                    <div className="flex items-center gap-2 font-mono text-sm">
                                                        {productVariations.length > 0 ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6 shrink-0 -ml-2"
                                                                onClick={(e) => toggleExpand(e, product.externalId)}
                                                            >
                                                                {expandedParents.has(product.externalId) ? (
                                                                    <ChevronDown className="h-4 w-4" />
                                                                ) : (
                                                                    <ChevronRight className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        ) : (
                                                            <div className="w-4 shrink-0 -ml-2" />
                                                        )}
                                                        {product.externalId}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-medium whitespace-normal min-w-[250px] max-w-xl">
                                                    <div className="inline">
                                                        {product.name}
                                                        {product.productUrl && (
                                                            <a
                                                                href={product.productUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors ml-1.5 align-middle border-0 p-0.5 bg-blue-50 rounded-[3px]"
                                                                onClick={(e) => e.stopPropagation()}
                                                                title="View on Store"
                                                            >
                                                                <ExternalLink className="h-3 w-3" />
                                                            </a>
                                                        )}
                                                    </div>
                                                    <div className="font-mono text-xs text-muted-foreground/70 mt-0.5 flex items-center gap-2">
                                                        {product.sku || "-"}
                                                        {product.fulfillmentChannelCode?.startsWith("AMAZON") && (
                                                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-orange-50 text-orange-700 border-orange-200">FBA</Badge>
                                                        )}
                                                        {product.fulfillmentChannelCode === "DEFAULT" && (
                                                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200">MFN</Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {product.type ? (
                                                        <Badge variant="outline" className="capitalize">
                                                            {product.type}
                                                        </Badge>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {product.stockQuantity !== null
                                                        ? product.stockQuantity
                                                        : "—"}
                                                </TableCell>
                                                <TableCell className="text-right whitespace-nowrap">
                                                    {product.lastSyncedAt ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[14px] font-medium text-foreground">
                                                                {new Date(product.lastSyncedAt).toISOString().slice(0, 10)}
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                                                                {new Date(product.lastSyncedAt).toISOString().slice(11, 19)} UTC
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </TableCell>
                                                {canRefetchItem && (
                                                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                        <SyncProductButton 
                                                            channelId={channelId} 
                                                            externalId={product.externalId} 
                                                            onSuccess={(pid) => pid && invalidate(pid)} 
                                                        />
                                                    </TableCell>
                                                )}
                                            </TableRow>

                                            {expandedParents.has(product.externalId) && productVariations.map((variation) => (
                                                <TableRow
                                                    key={variation.id}
                                                    className="bg-muted/30 hover:bg-muted/40 transition-colors cursor-pointer"
                                                    onClick={() => handleRowClick(variation.id)}
                                                >
                                                    <TableCell className="whitespace-nowrap pl-6">
                                                        <div className="flex items-center gap-2">
                                                            <CornerDownRight className="h-4 w-4 text-muted-foreground/50" />
                                                            <div className="font-mono text-sm">
                                                                {variation.externalId}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-medium whitespace-normal min-w-[250px] max-w-xl text-sm pl-4">
                                                        <div className="inline">
                                                            {variation.name.includes(" — ") ? variation.name.split(" — ").pop() : variation.name}
                                                            {variation.productUrl && (
                                                                <a
                                                                    href={variation.productUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors ml-1.5 align-middle border-0 p-0.5 bg-blue-50 rounded-[3px]"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    title="View on Store"
                                                                >
                                                                    <ExternalLink className="h-2.5 w-2.5" />
                                                                </a>
                                                            )}
                                                        </div>
                                                        <div className="font-mono text-xs text-muted-foreground/70 mt-0.5 flex items-center gap-2">
                                                            {variation.sku || "-"}
                                                            {variation.fulfillmentChannelCode?.startsWith("AMAZON") && (
                                                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-orange-50 text-orange-700 border-orange-200">FBA</Badge>
                                                            )}
                                                            {variation.fulfillmentChannelCode === "DEFAULT" && (
                                                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200">MFN</Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {variation.type ? (
                                                            <Badge variant="secondary" className="capitalize text-[10px] font-medium px-2 py-0">
                                                                {variation.type}
                                                            </Badge>
                                                        ) : (
                                                            "—"
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {variation.stockQuantity !== null
                                                            ? variation.stockQuantity
                                                            : "—"}
                                                    </TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">
                                                        {variation.lastSyncedAt ? (
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[14px] font-medium text-foreground">
                                                                    {new Date(variation.lastSyncedAt).toISOString().slice(0, 10)}
                                                                </span>
                                                                <span className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                                                                    {new Date(variation.lastSyncedAt).toISOString().slice(11, 19)} UTC
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            "—"
                                                        )}
                                                    </TableCell>
                                                    {canRefetchItem && (
                                                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                            <SyncProductButton 
                                                                channelId={channelId} 
                                                                externalId={variation.externalId} 
                                                                onSuccess={(pid) => pid && invalidate(pid)} 
                                                            />
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            ))}
                                        </Fragment>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* ── Product Detail Drawer ────────────────────────────────────────── */}
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetContent side="right" className="sm:max-w-[80vw] w-[55vw] max-w-full p-0 flex flex-col gap-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full p-6">
                            <SheetTitle className="sr-only">Loading product details...</SheetTitle>
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : selectedProduct ? (
                        <>
                            <SheetHeader className="p-6 border-b shrink-0">
                                <SheetTitle className="text-base leading-snug pr-6">
                                    {selectedProduct.name}
                                </SheetTitle>
                                <SheetDescription className="flex items-center gap-2">
                                    <span>
                                        {selectedProduct.productUrl ? (
                                            <a
                                                href={selectedProduct.productUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline"
                                            >
                                                {selectedProduct.externalId}
                                            </a>
                                        ) : (
                                            selectedProduct.externalId
                                        )}
                                        {selectedProduct.sku && ` · ${selectedProduct.sku}`}
                                    </span>
                                    <span>·</span>
                                    <span>
                                        <strong>Last Synced:</strong> {selectedProduct.lastSyncedAt ? new Date(selectedProduct.lastSyncedAt).toLocaleString() : "Never"}
                                    </span>
                                </SheetDescription>
                            </SheetHeader>
                            <div className="flex-1 flex flex-col min-h-0 w-full relative">
                                <ProductDetailTabs
                                    product={selectedProduct}
                                    onSaveSuccess={(id) => {
                                        invalidate(id);
                                        setDrawerOpen(false);
                                    }}
                                    onClose={() => setDrawerOpen(false)}
                                    channelName={channelName}
                                />
                            </div>
                        </>
                    ) : null}
                </SheetContent>
            </Sheet>
        </>
    );
}
