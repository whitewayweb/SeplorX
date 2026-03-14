"use client";

import React, { useActionState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateChannelProductDetails } from "@/app/(dashboard)/channels/actions";
import { toast } from "sonner";

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

// ── rawData extraction ────────────────────────────────────────────────────────
// Extracts display-ready values from the channel-specific rawData blob.
// Keeps all the Amazon/WooCommerce key-name knowledge out of the JSX.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNestedValue(obj: any, key: string): string {
    if (!obj) return "";
    if (typeof obj[key] === "string") return obj[key];
    if (Array.isArray(obj[key]) && obj[key][0]?.value) return obj[key][0].value;
    return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDimensionValue(dimObj: any, key: string): string {
    if (!dimObj?.[key]) return "";
    const val  = dimObj[key].value !== undefined ? dimObj[key].value : dimObj[key];
    const unit = dimObj[key].unit || "";
    const num  = Number(val);
    if (isNaN(num)) return "";
    return `${num.toFixed(2)} ${unit}`.trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractProductFields(rawData: Record<string, any>) {
    const summaries     = Array.isArray(rawData.summaries)      ? rawData.summaries[0] || {}          : {};
    const attributes    = Array.isArray(rawData.attributes)     ? rawData.attributes[0] || {}         : {};
    const dimensions    = Array.isArray(rawData.dimensions)     ? rawData.dimensions[0] || {}         : {};
    const images        = Array.isArray(rawData.images)         ? rawData.images[0]?.images || []     : [];
    const relationships = Array.isArray(rawData.relationships)  ? rawData.relationships[0]?.relationships || [] : [];

    return {
        brand:        getNestedValue(summaries, "brand")        || getNestedValue(attributes, "brand")        || rawData["brand-name"] || "",
        color:        getNestedValue(summaries, "color")        || getNestedValue(attributes, "color")        || "",
        partNumber:   getNestedValue(summaries, "partNumber")   || getNestedValue(attributes, "part_number")  || "",
        manufacturer: getNestedValue(summaries, "manufacturer") || getNestedValue(attributes, "manufacturer") || "",
        description:  getNestedValue(attributes, "product_description") || "",
        itemTypeKw:   getNestedValue(attributes, "item_type_keyword")   || "",
        price:        rawData.price || "",
        itemCondition: rawData["item-condition"] || "New",
        pkgWeight:    getDimensionValue(dimensions, "package") || getDimensionValue(dimensions?.package, "weight"),
        itemWeight:   getDimensionValue(dimensions, "item")    || getDimensionValue(dimensions?.item, "weight"),
        images,
        relationships,
    };
}

// ── Inline field error ────────────────────────────────────────────────────────

function FieldError({ errors }: { errors?: string[] }) {
    if (!errors?.length) return null;
    return <p className="text-xs text-destructive mt-1">{errors[0]}</p>;
}

// ── Reusable tab trigger style ────────────────────────────────────────────────

const tabTriggerCls = "data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 border-primary rounded-none";

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductDetailTabs({ product, onSaveSuccess }: ProductDetailTabsProps) {
    const fields = extractProductFields(product.rawData || {});

    const [state, action, pending] = useActionState(
        async (prev: ActionState, formData: FormData): Promise<ActionState> => {
            const result = await updateChannelProductDetails(prev, formData);
            if (result?.success) {
                toast.success("Channel product updated", {
                    description: "Updates have been staged for the next provider sync.",
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
                    <DetailsTab fields={fields} product={product} fe={fe} />
                    <ImagesTab images={fields.images} />
                    <OfferTab product={product} fields={fields} fe={fe} />
                    <VariationsTab relationships={fields.relationships} />
                </div>

                <div className="absolute bottom-0 left-0 right-0 bg-background border-t p-4 flex justify-end gap-3 z-10 w-full rounded-b-md shadow-[0_-4px_6px_-2px_rgba(0,0,0,0.05)]">
                    <Button type="button" variant="outline">Cancel</Button>
                    <Button type="submit" disabled={pending}>
                        {pending ? "Saving..." : "Save Updates to Provider"}
                    </Button>
                </div>
            </Tabs>
        </form>
    );
}

// ── Sub-components (one per tab) ──────────────────────────────────────────────

function ReadOnlyField({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid gap-2">
            <Label>{label}</Label>
            <Input defaultValue={value} disabled className="bg-muted/50" />
        </div>
    );
}

function DetailsTab({
    fields,
    product,
    fe,
}: {
    fields: ReturnType<typeof extractProductFields>;
    product: ChannelProductDetail;
    fe: Record<string, string[] | undefined>;
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
                <ReadOnlyField label="Brand"             value={fields.brand} />
                <ReadOnlyField label="Manufacturer"      value={fields.manufacturer} />
                <ReadOnlyField label="Part Number"       value={fields.partNumber} />
                <ReadOnlyField label="Color"             value={fields.color} />
                <ReadOnlyField label="Item Type Keyword" value={fields.itemTypeKw} />
            </div>

            <div className="grid gap-2">
                <Label>Product Description</Label>
                <textarea
                    className="min-h-[120px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    defaultValue={fields.description}
                    disabled
                />
            </div>

            <div className="pt-4 border-t grid grid-cols-2 gap-6">
                <ReadOnlyField label="Package Weight" value={fields.pkgWeight} />
                <ReadOnlyField label="Item Weight"    value={fields.itemWeight} />
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
    fields: ReturnType<typeof extractProductFields>;
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
                        title="Stock is managed from central SeplorX inventory"
                    />
                    <p className="text-[10px] text-muted-foreground absolute -bottom-5 left-0">Managed in SeplorX inventory</p>
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
                    <Label>Last Synced From Amazon</Label>
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
                Parent-Child variations for this Amazon catalog item.
            </div>
            {relationships.length > 0 ? (
                <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b text-left">
                            <tr>
                                <th className="p-3 font-medium">Type</th>
                                <th className="p-3 font-medium">Related ASIN</th>
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
