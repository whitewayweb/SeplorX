"use client";

import { useOptimistic, useTransition } from "react";
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
import { ProductDialog } from "@/components/organisms/products/product-dialog";
import { StockAdjustmentDialog } from "@/components/organisms/products/stock-adjustment-dialog";
import { toggleProductActive, deleteProduct } from "@/app/(dashboard)/products/actions";
import { Power, Trash2 } from "lucide-react";

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
};

interface ProductListProps {
  products: Product[];
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

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          onDeleteOptimistic();
          const result = await deleteProduct(null, formData);
          if (result.error) {
            toast.error(result.error);
          } else if (result.success) {
            toast.success("Product deleted successfully");
          }
        });
      }}
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

export function ProductList({ products }: ProductListProps) {
  const [optimisticProducts, setOptimisticProducts] = useOptimistic(
    products,
    (state, info: { action: "toggle" | "delete"; id: number }) => {
      switch (info.action) {
        case "toggle":
          return state.map((p) =>
            p.id === info.id ? { ...p, isActive: !p.isActive } : p
          );
        case "delete":
          return state.filter((p) => p.id !== info.id);
        default:
          return state;
      }
    }
  );

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
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Purchase</TableHead>
            <TableHead className="text-right">Selling</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {optimisticProducts.map((product) => (
            <TableRow key={product.id}>
              <TableCell className="font-medium">
                <Link href={`/products/${product.id}`} className="hover:underline text-primary">
                  {product.name}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-sm">{product.sku ?? "—"}</TableCell>
              <TableCell>{product.category ?? "—"}</TableCell>
              <TableCell>{product.unit}</TableCell>
              <TableCell className="text-right">{formatPrice(product.purchasePrice)}</TableCell>
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
                  <StockAdjustmentDialog productId={product.id} productName={product.name} />
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
        </TableBody>
      </Table>
    </div>
  );
}
