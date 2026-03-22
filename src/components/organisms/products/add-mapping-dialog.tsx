"use client";

import { useState, useTransition, useMemo, useCallback, useEffect } from "react";
import { useAtom } from "jotai";
import { channelProductsAtom } from "@/lib/store";
import { Plus, Search, Loader2, AlertCircle, ChevronDown, ChevronRight, ChevronLeft, X, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchChannelProducts,
  fetchChannelVariations,
  saveChannelMappings,
} from "@/app/(dashboard)/products/actions";
import type { ChannelProductWithState } from "@/app/(dashboard)/products/actions";

interface AddMappingDialogProps {
  productId: number;
  channelId: number;
  channelName: string;
}

type Tab = "simple" | "variable";

// ─── Mapping state badge ───────────────────────────────────────────────────────

function MappingBadge({ state }: { state: ChannelProductWithState["mappingState"] }) {
  if (state.kind === "mapped_here") {
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100 text-xs shrink-0">
        Already mapped
      </Badge>
    );
  }
  if (state.kind === "mapped_other") {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs shrink-0">
        Mapped to {state.productName}
      </Badge>
    );
  }
  return null;
}

// ─── Single simple product row ─────────────────────────────────────────────────

function ProductRow({
  product,
  selected,
  onToggle,
}: {
  product: ChannelProductWithState;
  selected: boolean;
  onToggle: () => void;
}) {
  const { mappingState } = product;
  const isDisabled = mappingState.kind !== "unmapped";

  return (
    <label
      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none transition-colors ${isDisabled
        ? "opacity-50 cursor-not-allowed"
        : "hover:bg-muted/50"
        } ${selected ? "bg-muted/30" : ""}`}
    >
      <input
        type="checkbox"
        checked={mappingState.kind === "mapped_here" || selected}
        disabled={isDisabled}
        onChange={isDisabled ? undefined : onToggle}
        className="h-4 w-4 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm text-wrap font-medium truncate ${isDisabled && mappingState.kind === "mapped_other" ? "text-muted-foreground" : ""}`}>
            {product.name}
          </span>
          {product.sku && (
            <span className="font-mono text-xs text-muted-foreground shrink-0">
              SKU: {product.sku}
            </span>
          )}
          {product.stockQuantity !== undefined && (
            <span className="text-xs text-muted-foreground shrink-0">
              Stock: {product.stockQuantity}
            </span>
          )}
        </div>
      </div>
      <MappingBadge state={mappingState} />
    </label>
  );
}

// ─── Variable product group (Parent + Variations) ──────────────────────────────

function VariableProductGroup({
  parent,
  selectedIds,
  onToggle,
  channelId,
  productId,
  activeSearch,
}: {
  parent: ChannelProductWithState;
  selectedIds: Map<string, string>;
  onToggle: (id: string, name: string) => void;
  channelId: number;
  productId: number;
  activeSearch?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [variations, setVariations] = useState<ChannelProductWithState[] | null>(null);
  const [lastLoadedSearch, setLastLoadedSearch] = useState<string | undefined>(undefined);

  const loadVariations = useCallback(async () => {
    if (variations !== null && lastLoadedSearch === activeSearch) return;
    setLoading(true);
    try {
      const result = await fetchChannelVariations(channelId, productId, parent.id, activeSearch);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        setVariations(result);
        setLastLoadedSearch(activeSearch);
      }
    } catch (error) {
      console.error("[loadVariations]", error);
      toast.error("Failed to load variations");
    } finally {
      setLoading(false);
    }
  }, [channelId, productId, parent.id, variations, activeSearch]);

  useEffect(() => {
    if (isExpanded) {
      loadVariations();
    }
  }, [isExpanded, loadVariations]);

  const countMapped = variations?.filter(v => v.mappingState.kind !== "unmapped").length ?? 0;

  return (
    <div className="border-b border-border/40 last:border-0 overflow-hidden">
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${isExpanded ? "bg-muted/20" : ""
          }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="text-muted-foreground shrink-0">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{parent.name}</span>
            <Badge variant="outline" className="text-[10px] font-medium h-4 px-1.5 border-border/60">
              Variable Product
            </Badge>
            {countMapped > 0 && (
              <span className="text-[10px] text-muted-foreground">
                ({countMapped} linked)
              </span>
            )}
          </div>
        </div>
        <MappingBadge state={parent.mappingState} />
      </div>

      {isExpanded && (
        <div className="bg-muted/10 divide-y divide-border/20 border-t border-border/20">
          {loading ? (
            <div className="px-11 py-4 flex items-center gap-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading variations...
            </div>
          ) : !variations || variations.length === 0 ? (
            <div className="px-11 py-3 text-xs text-muted-foreground italic flex items-center gap-2">
              <AlertCircle className="h-3 w-3" />
              No variations found for this product.
            </div>
          ) : (
            variations.map((v) => (
              <ProductRow
                key={v.id}
                product={v}
                selected={selectedIds.has(v.id)}
                onToggle={() => onToggle(v.id, v.name)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton loader ────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-0 divide-y">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-4 w-4 rounded bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Sheet ───────────────────────────────────────────────────────────────────

export function AddMappingDialog({
  productId,
  channelId,
  channelName,
}: AddMappingDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ChannelProductWithState[]>([]);
  const [total, setTotal] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [selectedItems, setSelectedItems] = useState<Map<string, string>>(new Map());
  const [activeTab, setActiveTab] = useState<Tab>("simple");
  const [isSaving, startSave] = useTransition();

  const [cache, setCache] = useAtom(channelProductsAtom);

  const cacheKey = `${channelId}:${currentPage}:${itemsPerPage}:${activeSearch.trim().toLowerCase()}`;

  const loadProducts = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh && cache.has(cacheKey)) {
        const cached = cache.get(cacheKey)!;
        setProducts(cached.products);
        setTotal(cached.total);
        return;
      }

      setLoading(true);
      try {
        const result = await fetchChannelProducts(channelId, productId, activeSearch, currentPage, itemsPerPage);
        if ("error" in result) {
          toast.error(result.error);
        } else {
          setProducts(result.products);
          setTotal(result.total);
          setCache((prev) => {
            const next = new Map(prev);
            next.set(cacheKey, result);
            return next;
          });
        }
      } catch (err) {
        console.error("[AddMappingDialog]", err);
        toast.error("Failed to load products");
      } finally {
        setLoading(false);
      }
    },
    [channelId, productId, activeSearch, currentPage, itemsPerPage, cache, cacheKey, setCache],
  );

  useEffect(() => {
    if (open) {
      loadProducts();
    }
  }, [open, loadProducts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveSearch(searchQuery);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function handleSearchSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setActiveSearch(searchQuery);
    setCurrentPage(1);
  }

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (!isOpen) {
      setSelectedItems(new Map());
      setSearchQuery("");
      setActiveSearch("");
      setCurrentPage(1);
    }
  }

  function toggleSelected(id: string, name: string) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });
  }

  const { simpleProducts, variableParents } = useMemo(() => {
    const simple: ChannelProductWithState[] = [];
    const parents: ChannelProductWithState[] = [];

    for (const p of products) {
      if (p.type === "variable") {
        parents.push(p);
      } else {
        // Simple products OR Variations that were returned as top-level search results
        simple.push(p);
      }
    }

    return {
      simpleProducts: simple,
      variableParents: parents,
    };
  }, [products]);

  const totalPages = Math.ceil(total / itemsPerPage);
  const canSave = selectedItems.size > 0;

  async function handleSave() {
    if (selectedItems.size === 0) return;

    startSave(async () => {
      const items = Array.from(selectedItems.entries()).map(([id, label]) => ({
        externalProductId: id,
        label,
      }));

      const res = await saveChannelMappings(productId, channelId, items);
      if ("error" in res) {
        toast.error(res.error);
      } else {
        toast.success(`Successfully linked ${res.added} product${res.added !== 1 ? "s" : ""}`);
        handleOpen(false);
        setCache(new Map());
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/5 gap-1 transition-colors"
        onClick={() => handleOpen(true)}
      >
        <Plus className="h-3 w-3" />
        Link Product
      </Button>

      <SheetContent side="right" className="sm:max-w-[80%] w-full p-0 flex flex-col h-full overflow-hidden" showCloseButton={false}>
        <SheetHeader className="px-6 py-4 border-b border-border/40 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-lg font-bold tracking-tight">Link Channel Product</SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Select items from {channelName} to link to this product</p>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <X className="h-4 w-4" />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="bg-muted/20 rounded-xl border border-border/40 flex flex-col flex-1 min-h-0 overflow-hidden">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <TabsList variant="line" className="w-full justify-start px-6 bg-transparent h-auto py-0 gap-6">
                  <div className="flex items-center gap-6">
                    <TabsTrigger
                      value="simple"
                      className="flex-none"
                    >
                      Simple Products
                    </TabsTrigger>
                    <TabsTrigger
                      value="variable"
                      className="flex-none"
                    >
                      Variable Products
                    </TabsTrigger>
                  </div>

                  <div className="flex-1" />

                  <div className="flex items-center gap-3 py-2 pr-6 min-w-[280px]">
                    <form onSubmit={handleSearchSubmit} className="relative flex-1 group">
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                      <Input
                        placeholder="Search items..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                        }}
                        className="pl-10 h-9 text-xs bg-foreground/10 border-none focus-visible:ring-1 focus-visible:ring-primary/20 rounded-lg"
                      />
                    </form>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => loadProducts(true)}
                      disabled={loading}
                      title="Refresh products"
                      className="h-9 w-9 text-muted-foreground hover:text-primary transition-colors shrink-0"
                    >
                      <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} />
                    </Button>
                  </div>
                </TabsList>

                <div className="border-b border-border/40 mb-2" />

                <div className="flex-1 overflow-y-auto divide-y divide-border/40">
                  {loading ? (
                    <LoadingSkeleton />
                  ) : products.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-12 text-center h-full">
                      <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center">
                        <AlertCircle className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">No results found</p>
                        <p className="text-xs text-muted-foreground mt-1">Try a different search or syncing products</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <TabsContent value="simple" className="m-0 focus-visible:outline-none">
                        {simpleProducts.length === 0 ? (
                          <div className="py-12 text-center text-xs text-muted-foreground">
                            No simple products match this query.
                          </div>
                        ) : (
                          simpleProducts.map((p) => (
                            <ProductRow
                              key={p.id}
                              product={p}
                              selected={selectedItems.has(p.id)}
                              onToggle={() => toggleSelected(p.id, p.name)}
                            />
                          ))
                        )}
                      </TabsContent>

                      <TabsContent value="variable" className="m-0 focus-visible:outline-none">
                        {variableParents.length === 0 ? (
                          <div className="py-12 text-center text-xs text-muted-foreground">
                            No variable products match this query.
                          </div>
                        ) : (
                          variableParents.map((p) => (
                            <VariableProductGroup
                              key={p.id}
                              parent={p}
                              selectedIds={selectedItems}
                              onToggle={toggleSelected}
                              channelId={channelId}
                              productId={productId}
                              activeSearch={activeSearch}
                            />
                          ))
                        )}
                      </TabsContent>
                    </>
                  )}
                </div>

                <div className="border-t border-border/40 bg-muted/30 px-3 py-2 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Select
                      value={itemsPerPage.toString()}
                      onValueChange={(v) => {
                        setItemsPerPage(Number(v));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="h-7 w-[65px] text-[10px] bg-background border-border/40">
                        <SelectValue placeholder={itemsPerPage.toString()} />
                      </SelectTrigger>
                      <SelectContent side="top">
                        {[25, 50, 100, 200].map((size) => (
                          <SelectItem key={size} value={size.toString()} className="text-[10px]">
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-[10px] text-muted-foreground">
                      {total > 0 ? (
                        <>Showing {Math.min(total, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(total, currentPage * itemsPerPage)} of {total}</>
                      ) : "0 results"}
                    </span>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={currentPage === 1 || loading}
                        onClick={() => setCurrentPage(prev => prev - 1)}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-[10px] font-medium min-w-[3rem] text-center">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={currentPage === totalPages || loading}
                        onClick={() => setCurrentPage(prev => prev + 1)}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </Tabs>
            </div>

            <div className="mt-4 flex items-center justify-between px-1 shrink-0 pb-2">
              <span className="text-xs font-medium text-muted-foreground">
                {selectedItems.size > 0 ? (
                  <span className="text-primary font-semibold">{selectedItems.size} item{selectedItems.size !== 1 ? "s" : ""} selected</span>
                ) : (
                  "Select items to link"
                )}
              </span>
              <div className="flex gap-2">
                <SheetClose asChild>
                  <Button variant="ghost" size="sm" className="h-8 text-xs rounded-lg px-4 hover:bg-muted">Cancel</Button>
                </SheetClose>
                <Button
                  size="sm"
                  disabled={!canSave || isSaving}
                  onClick={handleSave}
                  className="h-8 text-xs px-5 rounded-lg bg-primary hover:bg-primary/90 shadow-sm transition-all active:scale-[0.98]"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    "Save Mappings"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
