"use client";

import { useActionState } from "react";
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
import { ProductDialog } from "@/components/products/product-dialog";
import { StockAdjustmentDialog } from "@/components/products/stock-adjustment-dialog";
import { toggleProductActive, deleteProduct } from "@/app/products/actions";
import { Eye, Power, Trash2 } from "lucide-react";

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

function ToggleButton({ product }: { product: Product }) {
  const [, action, pending] = useActionState(toggleProductActive, null);

  return (
    <form action={action}>
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

function DeleteButton({ product }: { product: Product }) {
  const [state, action, pending] = useActionState(deleteProduct, null);

  return (
    <form action={action}>
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
      {state?.error && (
        <span className="text-xs text-destructive">{state.error}</span>
      )}
    </form>
  );
}

function formatPrice(value: string | null): string {
  if (!value) return "—";
  const num = parseFloat(value);
  return isNaN(num) ? "—" : `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export function ProductList({ products }: ProductListProps) {
  if (products.length === 0) {
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
          {products.map((product) => (
            <TableRow key={product.id}>
              <TableCell className="font-medium">{product.name}</TableCell>
              <TableCell className="font-mono text-sm">{product.sku ?? "—"}</TableCell>
              <TableCell>{product.category ?? "—"}</TableCell>
              <TableCell>{product.unit}</TableCell>
              <TableCell className="text-right">{formatPrice(product.purchasePrice)}</TableCell>
              <TableCell className="text-right">{formatPrice(product.sellingPrice)}</TableCell>
              <TableCell className="text-right">
                <StockBadge quantity={product.quantityOnHand} reorderLevel={product.reorderLevel} />
              </TableCell>
              <TableCell>
                <Badge variant={product.isActive ? "default" : "secondary"}>
                  {product.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/products/${product.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  <StockAdjustmentDialog productId={product.id} productName={product.name} />
                  <ProductDialog product={product} />
                  <ToggleButton product={product} />
                  <DeleteButton product={product} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
