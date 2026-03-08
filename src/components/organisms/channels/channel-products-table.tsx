"use client";

import { useState, useCallback, Fragment } from "react";
import { CornerDownRight, RefreshCw, Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { atom, useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
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
import { getCatalogItem, getChannelProduct } from "@/app/(dashboard)/channels/actions";
import { ProductDetailTabs } from "./product-detail-tabs";

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
}

interface VariationRow extends ProductRow {
    parentId?: string;
}

interface ChannelProductDetail {
    id: number;
    channelId: number;
    externalId: string;
    name: string;
    sku: string | null;
    type: string | null;
    stockQuantity: number | null;
    rawData: Record<string, unknown>;
    lastSyncedAt: Date | null;
}

interface ChannelProductsTableProps {
    channelId: number;
    products: ProductRow[];
    variations: VariationRow[];
    canRefetchItem: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// State Atoms
// ────────────────────────────────────────────────────────────────────────────

const drawerOpenAtom = atom(false);
const selectedProductIdAtom = atom<number | null>(null);

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function ChannelProductsTable({
    channelId,
    products,
    variations,
    canRefetchItem,
}: ChannelProductsTableProps) {
    const router = useRouter();
    const [drawerOpen, setDrawerOpen] = useAtom(drawerOpenAtom);
    const [selectedProductId, setSelectedProductId] = useAtom(selectedProductIdAtom);
    const [refetchingId, setRefetchingId] = useState<string | null>(null);
    const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

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

    const { data: selectedProduct, isFetching: loadingDetail } = useQuery({
        queryKey: ["channelProduct", selectedProductId],
        queryFn: async () => {
            if (!selectedProductId) return null;
            const result = await getChannelProduct(selectedProductId);
            if (result.error || !result.product) {
                toast.error("Failed to load product details", { description: result.error });
                return null;
            }
            return result.product as ChannelProductDetail;
        },
        enabled: drawerOpen && selectedProductId !== null,
    });

    // ── Open detail drawer ──────────────────────────────────────────────────

    const handleRowClick = useCallback(
        (productId: number) => {
            setSelectedProductId(productId);
            setDrawerOpen(true);
        },
        [setSelectedProductId, setDrawerOpen],
    );

    // ── Refetch single product ──────────────────────────────────────────────

    const handleRefetch = useCallback(
        (e: React.MouseEvent, externalId: string) => {
            e.stopPropagation(); // Don't open the drawer
            setRefetchingId(externalId);
            (async () => {
                try {
                    const result = await getCatalogItem(channelId, externalId);
                    if (result.error) {
                        toast.error("Failed to refetch product", { description: result.error });
                    } else {
                        toast.success("Product refreshed", {
                            description: `"${result.product?.name ?? externalId}" has been updated.`,
                        });
                        router.refresh();
                    }
                } catch (err) {
                    toast.error("Failed to refetch product", { description: String(err) });
                } finally {
                    setRefetchingId(null);
                }
            })();
        },
        [channelId, router],
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
                                    const isRefetching = refetchingId === product.externalId;

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
                                                    {product.name}
                                                    <div className="font-mono text-xs text-muted-foreground/70 mt-0.5">
                                                        {product.sku || "-"}
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
                                                    <TableCell className="text-center">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            onClick={(e) => handleRefetch(e, product.externalId)}
                                                            disabled={isRefetching}
                                                            title="Refetch from channel"
                                                        >
                                                            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
                                                        </Button>
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
                                                        {variation.name.includes(" — ") ? variation.name.split(" — ").pop() : variation.name}
                                                        <div className="font-mono text-xs text-muted-foreground/70 mt-0.5">
                                                            {variation.sku || "-"}
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
                                                    {canRefetchItem && <TableCell />}
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
                <SheetContent side="right" className="sm:max-w-[80vw] w-full overflow-y-auto w-[80vw]">
                    {loadingDetail ? (
                        <div className="flex items-center justify-center h-full">
                            <SheetTitle className="sr-only">Loading product details...</SheetTitle>
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : selectedProduct ? (
                        <>
                            <SheetHeader>
                                <SheetTitle className="text-base leading-snug pr-6">
                                    {selectedProduct.name}
                                </SheetTitle>
                                <SheetDescription>
                                    {selectedProduct.externalId}
                                    {selectedProduct.sku && ` · ${selectedProduct.sku}`}
                                </SheetDescription>
                            </SheetHeader>
                            <div className="flex-1 w-full pb-0 flex flex-col items-start px-0">
                                <ProductDetailTabs product={selectedProduct} />
                            </div>
                        </>
                    ) : null}
                </SheetContent>
            </Sheet>
        </>
    );
}
