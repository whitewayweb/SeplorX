"use client";

import { useState, useTransition, useMemo } from "react";
import { Plus, Search, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
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

// ─── Single WC product row ─────────────────────────────────────────────────────

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
      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none transition-colors ${
        isDisabled
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
          <span className={`text-sm font-medium truncate ${isDisabled && mappingState.kind === "mapped_other" ? "text-muted-foreground" : ""}`}>
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
      <div className="shrink-0">
        {mappingState.kind === "mapped_here" && (
          <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
            Already mapped
          </Badge>
        )}
        {mappingState.kind === "mapped_other" && (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs">
            Mapped to {mappingState.productName}
          </Badge>
        )}
      </div>
    </label>
  );
}

// ─── Skeleton loader ────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-0 divide-y">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
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

// ─── Dialog ─────────────────────────────────────────────────────────────────────

export function AddMappingDialog({ productId, channelId, channelName }: AddMappingDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const [products, setProducts] = useState<ChannelProductWithState[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && products === null) {
      loadProducts();
    }
    if (!isOpen) {
      // Reset selection on close but keep products cached
      setSelected(new Set());
      setSearch("");
    }
  }

  function loadProducts(searchTerm?: string) {
    setFetchError(null);
    startLoad(async () => {
      const result = await fetchChannelProducts(channelId, productId, searchTerm);
      if ("error" in result) {
        setFetchError(result.error);
        setProducts([]);
      } else {
        setProducts(result);
      }
    });
  }

  const filtered = useMemo(() => {
    if (!products) return [];
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)),
    );
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
      setProducts(null); // force reload next open to reflect new state
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Products
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Add Products — {channelName}</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-6 pb-3">
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

        {/* Product list */}
        <div className="border-y overflow-y-auto max-h-[380px] min-h-[120px]">
          {loading ? (
            <LoadingSkeleton />
          ) : fetchError ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {fetchError}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              {search ? "No products match your search." : "No products found in this channel."}
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  selected={selected.has(product.id)}
                  onToggle={() => toggleProduct(product.id)}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 flex flex-row items-center justify-between gap-3 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {selectableSelected > 0
              ? `${selectableSelected} selected`
              : "Select products to add"}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
