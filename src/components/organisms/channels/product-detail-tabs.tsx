"use client";

import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

export function ProductDetailTabs({ product }: { product: ChannelProductDetail }) {
    const rawData = product.rawData || {};

    // Safely extract Amazon specific arrays
    const summaries = Array.isArray(rawData.summaries) ? rawData.summaries[0] || {} : {};
    const attributes = Array.isArray(rawData.attributes) ? rawData.attributes[0] || {} : {};
    const dimensions = Array.isArray(rawData.dimensions) ? rawData.dimensions[0] || {} : {};
    const images = Array.isArray(rawData.images) ? rawData.images[0]?.images || [] : [];
    const relationships = Array.isArray(rawData.relationships) ? rawData.relationships[0]?.relationships || [] : [];

    // Abstracting common fields 
    // The Amazon format is often nested like: { brand: [{ value: "Hiya" }] }
    // Or in summaries: { brand: "Hiya", itemName: "Hiya Automotive..." }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getVal = (obj: any, key: string) => {
        if (!obj) return "";
        if (typeof obj[key] === "string") return obj[key];
        if (Array.isArray(obj[key]) && obj[key][0]?.value) return obj[key][0].value;
        return "";
    };

    const brand = getVal(summaries, "brand") || getVal(attributes, "brand") || rawData["brand-name"] || "";
    const color = getVal(summaries, "color") || getVal(attributes, "color") || "";
    const partNumber = getVal(summaries, "partNumber") || getVal(attributes, "part_number") || "";
    const manufacturer = getVal(summaries, "manufacturer") || getVal(attributes, "manufacturer") || "";
    const description = getVal(attributes, "product_description") || "";
    const itemTypeKw = getVal(attributes, "item_type_keyword") || "";

    // Dimensions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getDim = (dimObj: any, key: string) => {
        if (!dimObj || !dimObj[key]) return "";
        const val = dimObj[key].value || dimObj[key];
        const unit = dimObj[key].unit || "";
        return `${Number(val).toFixed(2)} ${unit}`.trim();
    };

    const pkgWeight = getDim(dimensions, "package") || getDim(dimensions?.package, "weight");
    const itemWeight = getDim(dimensions, "item") || getDim(dimensions?.item, "weight");

    return (
        <Tabs defaultValue="details" className="w-full mt-4">
            <TabsList className="w-full justify-start border-b rounded-none px-4 h-12 bg-transparent">
                <TabsTrigger value="details" className="data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 border-primary rounded-none">Product Details</TabsTrigger>
                <TabsTrigger value="images" className="data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 border-primary rounded-none">Images ({images.length})</TabsTrigger>
                <TabsTrigger value="offer" className="data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 border-primary rounded-none">Offer & Inventory</TabsTrigger>
                <TabsTrigger value="variations" className="data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 border-primary rounded-none">Variations ({relationships.length})</TabsTrigger>
            </TabsList>

            <div className="p-4 pt-6 max-w-4xl">
                {/* ── PRODUCT DETAILS TAB ── */}
                <TabsContent value="details" className="space-y-6 mt-0">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="grid gap-2">
                            <Label>Product Name</Label>
                            <Input defaultValue={product.name} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Brand</Label>
                            <Input defaultValue={brand} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Manufacturer</Label>
                            <Input defaultValue={manufacturer} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Part Number</Label>
                            <Input defaultValue={partNumber} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Color</Label>
                            <Input defaultValue={color} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Item Type Keyword</Label>
                            <Input defaultValue={itemTypeKw} />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label>Product Description</Label>
                        <textarea
                            className="min-h-[120px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            defaultValue={description}
                        />
                    </div>

                    <div className="pt-4 border-t grid grid-cols-2 gap-6">
                        <div className="grid gap-2">
                            <Label>Package Weight</Label>
                            <Input defaultValue={pkgWeight} disabled className="bg-muted/50" />
                        </div>
                        <div className="grid gap-2">
                            <Label>Item Weight</Label>
                            <Input defaultValue={itemWeight} disabled className="bg-muted/50" />
                        </div>
                    </div>
                </TabsContent>

                {/* ── IMAGES TAB ── */}
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

                {/* ── OFFER TAB ── */}
                <TabsContent value="offer" className="space-y-6 mt-0">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="grid gap-2">
                            <Label>Seller SKU</Label>
                            <Input defaultValue={product.sku || ""} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Price</Label>
                            <Input defaultValue={rawData.price || ""} type="number" />
                        </div>
                        <div className="grid gap-2">
                            <Label>Stock Quantity</Label>
                            <Input defaultValue={product.stockQuantity || 0} type="number" />
                        </div>
                        <div className="grid gap-2">
                            <Label>Condition</Label>
                            <Input defaultValue={rawData["item-condition"] || "New"} />
                        </div>
                        <div className="grid gap-2 relative">
                            <Label>Last Synced From Amazon</Label>
                            <Input
                                defaultValue={product.lastSyncedAt ? new Date(product.lastSyncedAt).toLocaleString() : ""}
                                disabled
                                className="bg-muted/50"
                            />
                        </div>
                    </div>
                </TabsContent>

                {/* ── VARIATIONS TAB ── */}
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
                                        const asins = rel.childAsins || rel.parentAsins || [];
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
            </div>

            <div className="sticky bottom-0 bg-background/80 backdrop-blur-md p-4 border-t flex justify-end gap-3 px-8 mt-12 w-full">
                <Button variant="outline">Cancel</Button>
                <Button>Save Updates to Provider</Button>
            </div>
        </Tabs>
    );
}
