"use client";

import { useState, useCallback, Fragment } from "react";
import { CornerDownRight, RefreshCw, Loader2 } from "lucide-react";
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

    function flattenObject(obj: unknown, prefix = ''): { key: string, value: unknown }[] {
        if (obj === null || obj === undefined || obj === "") return [];

        if (typeof obj !== "object") {
            return [{ key: prefix, value: obj }];
        }

        let result: { key: string, value: unknown }[] = [];

        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return [{ key: prefix, value: "[]" }];
            }
            for (let i = 0; i < obj.length; i++) {
                const newPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`;
                result = result.concat(flattenObject(obj[i], newPrefix));
            }
        } else {
            const entries = Object.entries(obj as Record<string, unknown>).filter(
                ([, v]) => v !== null && v !== undefined && v !== ""
            );
            if (entries.length === 0) {
                return [{ key: prefix, value: "{}" }];
            }
            for (const [k, v] of entries) {
                const newPrefix = prefix ? `${prefix}.${k}` : k;
                result = result.concat(flattenObject(v, newPrefix));
            }
        }
        return result;
    }

    function renderRawData(data: Record<string, unknown>) {
        const topLevelEntries = Object.entries(data).filter(
            ([, v]) => v !== null && v !== undefined && v !== ""
        );

        if (topLevelEntries.length === 0) {
            return <p className="text-muted-foreground text-sm">No raw data available.</p>;
        }

        return (
            <div className="space-y-6">
                {topLevelEntries.map(([sectionKey, sectionData]) => {
                    const flattened = flattenObject(sectionData);

                    return (
                        <div key={sectionKey} className="space-y-2">
                            <h4 className="text-sm font-semibold text-foreground border-b pb-1">
                                {sectionKey}
                            </h4>
                            <div className="bg-muted/10 rounded-md border text-sm overflow-hidden">
                                {flattened.length === 0 ? (
                                    <div className="p-3 text-muted-foreground text-xs">—</div>
                                ) : (
                                    <div className="divide-y divide-muted/30">
                                        {flattened.map(({ key, value }, idx) => (
                                            <div key={idx} className="grid grid-cols-[minmax(150px,_35%)_1fr] gap-4 p-2.5 items-start px-3 hover:bg-muted/20 transition-colors">
                                                <div className="text-xs font-medium text-muted-foreground break-all" title={key || sectionKey}>
                                                    {key || "value"}
                                                </div>
                                                <div className="text-xs font-mono break-words text-foreground">
                                                    {String(value)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

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
                                                className={`cursor-pointer hover:bg-muted/50 transition-colors ${productVariations.length > 0 ? "border-b-0" : ""}`}
                                                onClick={() => handleRowClick(product.id)}
                                            >
                                                <TableCell className="whitespace-nowrap">
                                                    <div className="font-mono text-sm">
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

                                            {productVariations.map((variation) => (
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

                            <div className="px-4 pb-6 space-y-5">
                                {/* Summary cards */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-lg border bg-muted/30 p-3">
                                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                            Type
                                        </div>
                                        <div className="mt-1 text-sm font-medium capitalize">
                                            {selectedProduct.type || "—"}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border bg-muted/30 p-3">
                                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                            Stock
                                        </div>
                                        <div className="mt-1 text-sm font-medium">
                                            {selectedProduct.stockQuantity ?? "—"}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border bg-muted/30 p-3 col-span-2">
                                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                            Last Synced
                                        </div>
                                        <div className="mt-1 text-sm font-medium">
                                            {selectedProduct.lastSyncedAt
                                                ? new Date(selectedProduct.lastSyncedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC"
                                                : "—"}
                                        </div>
                                    </div>
                                </div>

                                {/* Raw data */}
                                <div>
                                    <h3 className="text-sm font-semibold mb-3">All Product Data</h3>
                                    {renderRawData(selectedProduct.rawData)}
                                </div>
                            </div>
                        </>
                    ) : null}
                </SheetContent>
            </Sheet>
        </>
    );
}
