"use client";

import { useOptimistic, useTransition, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ProductDialog } from "@/components/organisms/products/product-dialog";
import { StockAdjustmentDialog } from "@/components/organisms/products/stock-adjustment-dialog";
import { toggleProductActive, deleteProduct } from "@/app/(dashboard)/products/actions";
import { Power, Trash2, Package, Layers } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Product = {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  purchasePrice: string | null;
  sellingPrice: string | null;
  reorderLevel: number;
  quantityOnHand: number;
  isActive: boolean;
  isBundle: boolean;
  isDeleting?: boolean;
};

interface ProductListProps {
  products: Product[];
  pendingMappingIds?: number[];
}

function StockBadge({ quantity, reorderLevel }: { quantity: number; reorderLevel: number }) {
  if (quantity <= 0) {
    return <Badge variant="destructive">Out of stock</Badge>;
  }
  if (quantity <= reorderLevel) {
    return <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">Low stock ({quantity})</Badge>;
  }
  return <span className="font-mono text-sm">{quantity}</span>;
}

function ToggleButton({ product, onToggleOptimistic }: { product: Product, onToggleOptimistic: () => void }) {
  const [pending, startTransition] = useTransition();

  return (
    <form action={(formData) => {
      startTransition(async () => {
        onToggleOptimistic();
        const result = await toggleProductActive(null, formData);
        if (result.error) {
          toast.error(result.error);
        } else if (result.success) {
          toast.success("Product status updated");
        }
      });
    }}>
      <input type="hidden" name="id" value={product.id} />
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        disabled={pending}
        title={product.isActive ? "Deactivate" : "Activate"}
      >
        <Power className={`h-4 w-4 ${product.isActive ? "text-green-600" : "text-muted-foreground"}`} />
      </Button>
    </form>
  );
}

function DeleteButton({ product, onDeleteOptimistic }: { product: Product, onDeleteOptimistic: () => void }) {
  const [pending, startTransition] = useTransition();

  async function handleDelete(formData: FormData) {
    startTransition(async () => {
      onDeleteOptimistic();
      const result = await deleteProduct(null, formData);
      if (result.error) {
        if ("code" in result && result.code === "HISTORY_BLOCK") {
          // If it failed due to history, offer force delete
          if (window.confirm("This product has inventory history. Deleting it will PERMANENTLY purge all stock transaction records. Are you sure you want to FORCE DELETE?")) {
            const forceData = new FormData();
            forceData.append("id", String(product.id));
            forceData.append("force", "true");
            const forceResult = await deleteProduct(null, forceData);
            if (forceResult.error) {
              toast.error(forceResult.error);
            } else {
              toast.success("Product and history deleted successfully");
            }
          }
        } else {
          toast.error(result.error);
        }
      } else if (result.success) {
        toast.success("Product deleted successfully");
      }
    });
  }

  return (
    <form
      action={handleDelete}
      onSubmit={(e) => {
        if (!window.confirm("Are you sure you want to delete this product?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={product.id} />
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        disabled={pending}
        title="Delete product"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </form>
  );
}

function formatPrice(value: string | null): string {
  if (!value) return "—";
  const num = parseFloat(value);
  return isNaN(num) ? "—" : `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export function ProductList({ products, pendingMappingIds = [] }: ProductListProps) {
  const [showInactive, setShowInactive] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [optimisticProducts, setOptimisticProducts] = useOptimistic(
    products.map(p => ({ ...p, isDeleting: false })),
    (state, info: { action: "toggle" | "delete"; id: number }) => {
      switch (info.action) {
        case "toggle":
          return state.map((p) =>
            p.id === info.id ? { ...p, isActive: !p.isActive } : p
          );
        case "delete":
          return state.map((p) => p.id === info.id ? { ...p, isDeleting: true } : p);
        default:
          return state;
      }
    }
  );

  let filteredProducts = showInactive 
    ? optimisticProducts 
    : optimisticProducts.filter(p => p.isActive);

  if (showPending && pendingMappingIds.length > 0) {
    filteredProducts = filteredProducts.filter(p => pendingMappingIds.includes(p.id));
  }

  const simpleProducts = filteredProducts.filter(p => !p.isBundle);
  const bundleProducts = filteredProducts.filter(p => p.isBundle);

  if (optimisticProducts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-lg">No products yet</p>
        <p className="text-muted-foreground text-sm mt-1">
          Add your first product to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-6 px-1">
        <div className="flex items-center space-x-2">
          <Switch 
            id="show-inactive" 
            checked={showInactive} 
            onCheckedChange={setShowInactive} 
          />
          <Label htmlFor="show-inactive" className="text-sm font-medium cursor-pointer">
            Show Inactive Products
          </Label>
        </div>
        
        {pendingMappingIds.length > 0 && (
          <div className="flex items-center space-x-2">
            <Switch 
              id="show-pending" 
              checked={showPending} 
              onCheckedChange={setShowPending} 
            />
            <Label htmlFor="show-pending" className="text-sm font-medium cursor-pointer text-amber-600 flex items-center gap-1">
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              Pending AI Mappings ({pendingMappingIds.length})
            </Label>
          </div>
        )}
      </div>

      <Tabs defaultValue="simple" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="simple" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Simple Products ({simpleProducts.length})
          </TabsTrigger>
          <TabsTrigger value="bundles" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Bundles & Combos ({bundleProducts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="simple" className="mt-0">
          <div className="rounded-md border">
            <ProductTable 
              products={simpleProducts} 
              pendingMappingIds={pendingMappingIds} 
              setOptimisticProducts={setOptimisticProducts} 
            />
          </div>
        </TabsContent>

        <TabsContent value="bundles" className="mt-0">
          <div className="rounded-md border">
            <ProductTable 
              products={bundleProducts} 
              pendingMappingIds={pendingMappingIds} 
              setOptimisticProducts={setOptimisticProducts} 
              isBundleTab
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductTable({ 
  products, 
  pendingMappingIds, 
  setOptimisticProducts,
  isBundleTab = false
}: { 
  products: Product[], 
  pendingMappingIds: number[], 
  setOptimisticProducts: (action: { action: "toggle" | "delete"; id: number }) => void,
  isBundleTab?: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Unit</TableHead>
          {!isBundleTab && <TableHead className="text-right">Purchase</TableHead>}
          <TableHead className="text-right">Selling</TableHead>
          <TableHead className="text-right">Stock</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id} className={product.isDeleting ? "opacity-30 pointer-events-none" : !product.isActive ? "opacity-60 bg-muted/30" : ""}>
            <TableCell className="font-medium">
              <div className="flex flex-col gap-1">
                <Link href={`/products/${product.id}`} className="hover:underline text-primary flex items-center gap-2">
                  {isBundleTab && <Badge variant="outline" className="text-[10px] uppercase">Bundle</Badge>}
                  {product.name}
                </Link>
                {pendingMappingIds.includes(product.id) && (
                  <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span> AI Mapping Review
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="font-mono text-sm">{product.sku ?? "—"}</TableCell>
            <TableCell>{product.category ?? "—"}</TableCell>
            <TableCell>{product.unit}</TableCell>
            {!isBundleTab && <TableCell className="text-right">{formatPrice(product.purchasePrice)}</TableCell>}
            <TableCell className="text-right">{formatPrice(product.sellingPrice)}</TableCell>
            <TableCell className="text-right">
              <StockBadge quantity={product.quantityOnHand} reorderLevel={product.reorderLevel} />
            </TableCell>
            <TableCell>
              <Badge variant={product.isActive ? "default" : "secondary"} className="transition-colors">
                {product.isActive ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                {!isBundleTab && <StockAdjustmentDialog productId={product.id} productName={product.name} />}
                <ProductDialog product={product} />
                <ToggleButton
                  product={product}
                  onToggleOptimistic={() => setOptimisticProducts({ action: "toggle", id: product.id })}
                />
                <DeleteButton
                  product={product}
                  onDeleteOptimistic={() => setOptimisticProducts({ action: "delete", id: product.id })}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
        {products.length === 0 && (
          <TableRow>
            <TableCell colSpan={isBundleTab ? 7 : 9} className="h-24 text-center text-muted-foreground">
              No products found.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
