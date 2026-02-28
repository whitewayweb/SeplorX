"use client";

import { useState, useTransition, useMemo } from "react";
import { Plus, Search, Loader2, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  fetchChannelProducts,
  saveChannelMappings,
} from "@/app/products/actions";
import type { ChannelProductWithState } from "@/app/products/actions";

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

// ─── Variable product group (parent + collapsible variations) ─────────────────

function VariableProductGroup({
  parent,
  variations,
  selected,
  onToggle,
}: {
  parent: ChannelProductWithState;
  variations: ChannelProductWithState[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const selectedVariationCount = variations.filter(
    (v) => selected.has(v.id) && v.mappingState.kind === "unmapped",
  ).length;

  return (
    <div className="border-b last:border-b-0">
      {/* Variable parent header – toggle expand */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-wrap font-medium truncate">{parent.name}</span>
            {parent.sku && (
              <span className="font-mono text-xs text-muted-foreground shrink-0">
                SKU: {parent.sku}
              </span>
            )}
            <Badge variant="outline" className="text-xs shrink-0">
              Variable · {variations.length} variation{variations.length !== 1 ? "s" : ""}
            </Badge>
            {selectedVariationCount > 0 && (
              <Badge className="text-xs shrink-0">
                {selectedVariationCount} selected
              </Badge>
            )}
          </div>
        </div>
      </button>

      {/* Variations */}
      {expanded && (
        <div className="bg-muted/20">
          {variations.length === 0 ? (
            <p className="px-10 py-2 text-xs text-muted-foreground">No variations found.</p>
          ) : (
            variations.map((variation) => (
              <label
                key={variation.id}
                className={`flex items-center gap-3 pl-10 pr-4 py-2 cursor-pointer select-none transition-colors ${variation.mappingState.kind !== "unmapped"
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-muted/50"
                  } ${selected.has(variation.id) ? "bg-muted/30" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={variation.mappingState.kind === "mapped_here" || selected.has(variation.id)}
                  disabled={variation.mappingState.kind !== "unmapped"}
                  onChange={
                    variation.mappingState.kind !== "unmapped"
                      ? undefined
                      : () => onToggle(variation.id)
                  }
                  className="h-3.5 w-3.5 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium truncate">{variation.name}</span>
                    {variation.sku && (
                      <span className="font-mono text-xs text-muted-foreground shrink-0">
                        SKU: {variation.sku}
                      </span>
                    )}
                    {variation.stockQuantity !== undefined && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        Stock: {variation.stockQuantity}
                      </span>
                    )}
                  </div>
                </div>
                <MappingBadge state={variation.mappingState} />
              </label>
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
      {[1, 2, 3, 4, 5].map((i) => (
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

// ─── Drawer ──────────────────────────────────────────────────────────────────

export function AddMappingDialog({ productId, channelId, channelName }: AddMappingDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const [products, setProducts] = useState<ChannelProductWithState[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Tab>("simple");

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && products === null) {
      loadProducts();
    }
    if (!isOpen) {
      setSelected(new Set());
      setSearch("");
    }
  }

  function loadProducts() {
    setFetchError(null);
    startLoad(async () => {
      const result = await fetchChannelProducts(channelId, productId);
      if ("error" in result) {
        setFetchError(result.error);
        setProducts([]);
      } else {
        setProducts(result);
      }
    });
  }

  // ─── Split + filter products ────────────────────────────────────────────────

  const { simpleProducts, variableParents, variationsByParent } = useMemo(() => {
    if (!products) {
      return {
        simpleProducts: [],
        variableParents: [],
        variationsByParent: new Map<string, ChannelProductWithState[]>(),
      };
    }

    const q = search.toLowerCase().trim();
    const matchesSearch = (p: ChannelProductWithState) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q));

    const simple: ChannelProductWithState[] = [];
    const parents: ChannelProductWithState[] = [];
    const byParent = new Map<string, ChannelProductWithState[]>();

    for (const p of products) {
      if (p.type === "variation") {
        const list = byParent.get(p.parentId ?? "") ?? [];
        list.push(p);
        byParent.set(p.parentId ?? "", list);
      } else if (p.type === "variable") {
        parents.push(p);
      } else {
        simple.push(p);
      }
    }

    const filteredSimple = simple.filter(matchesSearch);

    const filteredParents = parents.filter((p) => {
      if (matchesSearch(p)) return true;
      return (byParent.get(p.id) ?? []).some(matchesSearch);
    });

    const filteredByParent = new Map<string, ChannelProductWithState[]>();
    for (const [parentId, vars] of byParent.entries()) {
      filteredByParent.set(parentId, vars.filter(matchesSearch));
    }

    return {
      simpleProducts: filteredSimple,
      variableParents: filteredParents,
      variationsByParent: filteredByParent,
    };
  }, [products, search]);

  function toggleProduct(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const selectableSelected = useMemo(() => {
    if (!products) return 0;
    return [...selected].filter((id) => {
      const p = products.find((p) => p.id === id);
      return p && p.mappingState.kind === "unmapped";
    }).length;
  }, [selected, products]);

  function handleSave() {
    if (!products) return;
    const items = products
      .filter((p) => selected.has(p.id) && p.mappingState.kind === "unmapped")
      .map((p) => ({ externalProductId: p.id, label: p.name }));

    if (items.length === 0) return;

    startSave(async () => {
      const result = await saveChannelMappings(productId, channelId, items);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const { added, skipped } = result;
      if (skipped > 0) {
        toast.success(`${added} product${added !== 1 ? "s" : ""} added`, {
          description: `${skipped} already mapped — skipped.`,
        });
      } else {
        toast.success(`${added} product${added !== 1 ? "s" : ""} added`);
      }
      setOpen(false);
      setSelected(new Set());
      setProducts(null);
    });
  }

  // ─── Tab content ─────────────────────────────────────────────────────────────

  const tabContent = () => {
    if (loading) return <LoadingSkeleton />;

    if (fetchError) {
      return (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {fetchError}
        </div>
      );
    }

    if (activeTab === "simple") {
      if (simpleProducts.length === 0) {
        return (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">
            {search ? "No simple products match your search." : "No simple products in this channel."}
          </p>
        );
      }
      return (
        <div className="divide-y">
          {simpleProducts.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              selected={selected.has(product.id)}
              onToggle={() => toggleProduct(product.id)}
            />
          ))}
        </div>
      );
    }

    // variable tab
    if (variableParents.length === 0) {
      return (
        <p className="px-4 py-8 text-sm text-muted-foreground text-center">
          {search ? "No variable products match your search." : "No variable products in this channel."}
        </p>
      );
    }
    return (
      <div>
        {variableParents.map((parent) => (
          <VariableProductGroup
            key={parent.id}
            parent={parent}
            variations={variationsByParent.get(parent.id) ?? []}
            selected={selected}
            onToggle={toggleProduct}
          />
        ))}
      </div>
    );
  };

  return (
    <Drawer open={open} onOpenChange={handleOpen} direction="right">
      {/* Trigger */}
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => handleOpen(true)}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add Products
      </Button>

      <DrawerContent className="!w-[700px] !max-w-[700px] flex flex-col h-full">
        {/* Header */}
        <DrawerHeader className="border-b px-6 py-4 shrink-0">
          <DrawerTitle>Add Products — {channelName}</DrawerTitle>
        </DrawerHeader>

        {/* Search */}
        <div className="px-4 py-3 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name or SKU…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* Tab nav */}
        <div className="px-4 shrink-0">
          <ul className="flex gap-1 border-b">
            {(["simple", "variable"] as Tab[]).map((tab) => {
              const count =
                tab === "simple" ? simpleProducts.length : variableParents.length;
              const isActive = activeTab === tab;
              return (
                <li key={tab}>
                  <button
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${isActive
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                      }`}
                  >
                    {tab === "simple" ? "Simple" : "Variable"}
                    {!loading && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${isActive
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground"
                          }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Scrollable product list */}
        <div className="flex-1 overflow-y-auto">
          {tabContent()}
        </div>

        {/* Footer */}
        <DrawerFooter className="border-t px-6 py-4 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {selectableSelected > 0
                ? `${selectableSelected} selected`
                : "Select products to add"}
            </span>
            <div className="flex gap-2">
              <DrawerClose asChild>
                <Button variant="outline" size="sm" disabled={saving}>
                  Cancel
                </Button>
              </DrawerClose>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || selectableSelected === 0}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  `Add ${selectableSelected > 0 ? selectableSelected : ""} Product${selectableSelected !== 1 ? "s" : ""}`
                )}
              </Button>
            </div>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
