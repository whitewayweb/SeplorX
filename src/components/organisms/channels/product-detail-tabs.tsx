"use client";

import React, { useActionState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateChannelProductDetails } from "@/app/(dashboard)/channels/actions";
import { toast } from "sonner";
import { useAtomValue } from "jotai";
import { channelNameAtom } from "@/store/channels";
import { PORTAL_NAME } from "@/utils/constants";

import { getChannelById } from "@/lib/channels/registry";
import type { ChannelType, StandardizedProductRecord } from "@/lib/channels/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChannelProductDetail {
    id: number;
    channelId: number;
    externalId: string;
    name: string;
    sku: string | null;
    type: string | null;
    stockQuantity: number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawData: Record<string, any>;
    lastSyncedAt: Date | null;
    channelType: string;
}

interface ProductDetailTabsProps {
    product: ChannelProductDetail;
    /** Called after a successful save so the parent can evict its cache entry. */
    onSaveSuccess?: (productId: number) => void;
}

type ActionState = {
    success?: boolean;
    productId?: number;
    error?: string;
    fieldErrors?: Record<string, string[] | undefined>;
} | null;

// ── Inline field error ────────────────────────────────────────────────────────

function FieldError({ errors }: { errors?: string[] }) {
    if (!errors?.length) return null;
    return <p className="text-xs text-destructive mt-1">{errors[0]}</p>;
}

// ── Reusable tab trigger style ────────────────────────────────────────────────

const tabTriggerCls = "data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 border-primary rounded-none";

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductDetailTabs({ product, onSaveSuccess }: ProductDetailTabsProps) {
    const channelName = useAtomValue(channelNameAtom);
    const channelDef = getChannelById(product.channelType as ChannelType);
    
    // Use registry extraction or fallback to an empty object
    let rawData = product.rawData || {};
    if (typeof rawData === "string") {
        try { rawData = JSON.parse(rawData); } catch { rawData = {}; }
    }

    const fields = channelDef?.extractProductFields
        ? channelDef.extractProductFields(rawData)
        : {
            brand: "", color: "", partNumber: "", manufacturer: "", description: "", 
            itemTypeKw: "", category: "", price: "", itemCondition: "", pkgWeight: "", 
            itemWeight: "", images: [], relationships: []
        };

    const [state, action, pending] = useActionState(
        async (prev: ActionState, formData: FormData): Promise<ActionState> => {
            const result = await updateChannelProductDetails(prev, formData);
            if (result?.success) {
                toast.success("Channel product updated", {
                    description: `Updates have been staged for the next ${channelName || 'provider'} sync.`,
                });
                if (result.productId) onSaveSuccess?.(result.productId);
            } else if (result?.error && !result?.fieldErrors) {
                toast.error("Failed to update product", { description: result.error });
            }
            return result ?? null;
        },
        null,
    );

    const fe = state?.fieldErrors ?? {};

    return (
        <form action={action} className="w-full relative pb-16">
            <input type="hidden" name="id"         value={product.id} />
            <input type="hidden" name="channelId"  value={product.channelId} />
            <input type="hidden" name="externalId" value={product.externalId} />

            <Tabs defaultValue="details" className="w-full mt-4">
                <TabsList className="w-full justify-start border-b rounded-none px-4 h-12 bg-transparent">
                    <TabsTrigger value="details"    className={tabTriggerCls}>Product Details</TabsTrigger>
                    <TabsTrigger value="images"     className={tabTriggerCls}>Images ({fields.images.length})</TabsTrigger>
                    <TabsTrigger value="offer"      className={tabTriggerCls}>Offer &amp; Inventory</TabsTrigger>
                    <TabsTrigger value="variations" className={tabTriggerCls}>Variations ({fields.relationships.length})</TabsTrigger>
                </TabsList>

                <div className="p-4 pt-6 max-w-4xl">
                    <DetailsTab fields={fields} product={product} fe={fe} channelName={channelName} />
                    <ImagesTab images={fields.images} />
                    <OfferTab product={product} fields={fields} fe={fe} />
                    <VariationsTab relationships={fields.relationships} />
                </div>

                <div className="absolute bottom-0 left-0 right-0 bg-background border-t p-4 flex justify-end gap-3 z-10 w-full rounded-b-md shadow-[0_-4px_6px_-2px_rgba(0,0,0,0.05)]">
                    <Button type="button" variant="outline">Cancel</Button>
                    <Button type="submit" disabled={pending}>
                        {pending ? "Saving..." : `Save Updates to ${PORTAL_NAME}`}
                    </Button>
                </div>
            </Tabs>
        </form>
    );
}

// ── Sub-components (one per tab) ──────────────────────────────────────────────

function DetailsTab({
    fields,
    product,
    fe,
    channelName,
}: {
    fields: StandardizedProductRecord;
    product: ChannelProductDetail;
    fe: Record<string, string[] | undefined>;
    channelName?: string;
}) {
    return (
        <TabsContent value="details" className="space-y-6 mt-0">
            <div className="grid grid-cols-2 gap-6">
                <div className="grid gap-2">
                    <Label>Product Name</Label>
                    <Input
                        name="name"
                        defaultValue={product.name}
                        aria-invalid={!!fe.name}
                        className={fe.name ? "border-destructive" : ""}
                    />
                    <FieldError errors={fe.name} />
                </div>
                <div className="grid gap-2">
                    <Label>Category</Label>
                    <Input
                        defaultValue={fields.category}
                        disabled
                        className="bg-muted/50"
                        placeholder={`Synced automatically from ${channelName || 'provider'}`}
                    />
                    {!fields.category && (
                        <p className="text-xs text-muted-foreground">
                            Re-sync this product to populate the category.
                        </p>
                    )}
                </div>
                <div className="grid gap-2">
                    <Label>Brand</Label>
                    <Input name="brand" defaultValue={fields.brand} aria-invalid={!!fe.brand} className={fe.brand ? "border-destructive" : ""} />
                    <FieldError errors={fe.brand} />
                </div>
                <div className="grid gap-2">
                    <Label>Manufacturer</Label>
                    <Input name="manufacturer" defaultValue={fields.manufacturer} aria-invalid={!!fe.manufacturer} className={fe.manufacturer ? "border-destructive" : ""} />
                    <FieldError errors={fe.manufacturer} />
                </div>
                <div className="grid gap-2">
                    <Label>Part Number</Label>
                    <Input name="partNumber" defaultValue={fields.partNumber} aria-invalid={!!fe.partNumber} className={fe.partNumber ? "border-destructive" : ""} />
                    <FieldError errors={fe.partNumber} />
                </div>
                <div className="grid gap-2">
                    <Label>Color</Label>
                    <Input name="color" defaultValue={fields.color} aria-invalid={!!fe.color} className={fe.color ? "border-destructive" : ""} />
                    <FieldError errors={fe.color} />
                </div>
                <div className="grid gap-2">
                    <Label>Item Type Keyword</Label>
                    <Input name="itemTypeKw" defaultValue={fields.itemTypeKw} aria-invalid={!!fe.itemTypeKw} className={fe.itemTypeKw ? "border-destructive" : ""} />
                    <FieldError errors={fe.itemTypeKw} />
                </div>
            </div>

            <div className="grid gap-2">
                <Label>Product Description</Label>
                <textarea
                    name="description"
                    className={`min-h-[120px] rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${fe.description ? "border-destructive" : "border-input"}`}
                    defaultValue={fields.description}
                    aria-invalid={!!fe.description}
                />
                <FieldError errors={fe.description} />
            </div>

            <div className="pt-4 border-t grid grid-cols-2 gap-6">
                <div className="grid gap-2">
                    <Label>Package Weight</Label>
                    <Input name="pkgWeight" defaultValue={fields.pkgWeight} aria-invalid={!!fe.pkgWeight} className={fe.pkgWeight ? "border-destructive" : ""} />
                    <FieldError errors={fe.pkgWeight} />
                </div>
                <div className="grid gap-2">
                    <Label>Item Weight</Label>
                    <Input name="itemWeight" defaultValue={fields.itemWeight} aria-invalid={!!fe.itemWeight} className={fe.itemWeight ? "border-destructive" : ""} />
                    <FieldError errors={fe.itemWeight} />
                </div>
            </div>
        </TabsContent>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ImagesTab({ images }: { images: any[] }) {
    return (
        <TabsContent value="images" className="mt-0">
            {images.length > 0 ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {images.map((img: any, i: number) => (
                        <Card key={i} className="overflow-hidden group relative">
                            <div className="aspect-square bg-white flex items-center justify-center p-2 relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={img.link}
                                    alt={img.variant || `Image ${i}`}
                                    className="w-full h-full object-contain"
                                />
                                <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded font-medium uppercase">
                                    {img.variant}
                                </div>
                            </div>
                            <CardContent className="p-2 border-t bg-muted/20 text-xs flex justify-between">
                                <span className="text-muted-foreground">Res:</span>
                                <span className="font-medium">{img.width}x{img.height}</span>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 border rounded-lg text-muted-foreground bg-muted/20">
                    No images associated with this product.
                </div>
            )}
        </TabsContent>
    );
}

function OfferTab({
    product,
    fields,
    fe,
}: {
    product: ChannelProductDetail;
    fields: StandardizedProductRecord;
    fe: Record<string, string[] | undefined>;
}) {
    return (
        <TabsContent value="offer" className="space-y-6 mt-0">
            <div className="grid grid-cols-2 gap-6">
                <div className="grid gap-2">
                    <Label>Seller SKU</Label>
                    <Input
                        name="sku"
                        defaultValue={product.sku || ""}
                        aria-invalid={!!fe.sku}
                        className={fe.sku ? "border-destructive" : ""}
                    />
                    <FieldError errors={fe.sku} />
                </div>
                <div className="grid gap-2">
                    <Label>Price</Label>
                    <Input
                        name="price"
                        defaultValue={fields.price}
                        type="number"
                        step="0.01"
                        aria-invalid={!!fe.price}
                        className={fe.price ? "border-destructive" : ""}
                    />
                    <FieldError errors={fe.price} />
                </div>
                <div className="grid gap-2 relative">
                    <Label>Stock Quantity</Label>
                    <Input
                        name="stockQuantity"
                        value={product.stockQuantity || 0}
                        type="number"
                        disabled
                        className="bg-muted/50 cursor-not-allowed"
                        title={`Stock is managed from central ${PORTAL_NAME} inventory`}
                    />
                    <p className="text-[10px] text-muted-foreground absolute -bottom-5 left-0">Managed in {PORTAL_NAME} inventory</p>
                </div>
                <div className="grid gap-2">
                    <Label>Condition</Label>
                    <Input
                        name="itemCondition"
                        defaultValue={fields.itemCondition}
                        aria-invalid={!!fe.itemCondition}
                        className={fe.itemCondition ? "border-destructive" : ""}
                    />
                    <FieldError errors={fe.itemCondition} />
                </div>
                <div className="grid gap-2 relative">
                    <Label>Last Synced</Label>
                    <Input
                        readOnly
                        value={product.lastSyncedAt ? new Date(product.lastSyncedAt).toLocaleString() : ""}
                        disabled
                        className="bg-muted/50"
                    />
                </div>
            </div>
        </TabsContent>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function VariationsTab({ relationships }: { relationships: any[] }) {
    return (
        <TabsContent value="variations" className="space-y-6 mt-0">
            <div className="text-sm text-muted-foreground mb-4">
                Parent-Child variations for this catalog item.
            </div>
            {relationships.length > 0 ? (
                <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b text-left">
                            <tr>
                                <th className="p-3 font-medium">Type</th>
                                <th className="p-3 font-medium">Related ID</th>
                                <th className="p-3 font-medium">Variation Theme</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y text-muted-foreground">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {relationships.flatMap((rel: any, i: number) => {
                                const asins   = rel.childAsins || rel.parentAsins || [];
                                const isChild = !!rel.childAsins;
                                return asins.map((asin: string, j: number) => (
                                    <tr key={`${i}-${j}`} className="hover:bg-muted/30">
                                        <td className="p-3 capitalize text-xs">
                                            {isChild ? "Child" : "Parent"} ({rel.type?.replace(/_/g, " ").toLowerCase()})
                                        </td>
                                        <td className="p-3 font-mono text-xs text-foreground">{asin}</td>
                                        <td className="p-3 text-xs">{rel.variationTheme?.theme || "-"}</td>
                                    </tr>
                                ));
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-12 border rounded-lg text-muted-foreground bg-muted/20">
                    No relationships or variations found.
                </div>
            )}
        </TabsContent>
    );
}
