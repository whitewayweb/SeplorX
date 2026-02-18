import { db } from "@/db";
import { products, inventoryTransactions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductDialog } from "@/components/products/product-dialog";
import { StockAdjustmentDialog } from "@/components/products/stock-adjustment-dialog";

export const dynamic = "force-dynamic";

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

const TRANSACTION_TYPE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  purchase_in: { label: "Purchase In", variant: "default" },
  sale_out: { label: "Sale Out", variant: "destructive" },
  adjustment: { label: "Adjustment", variant: "secondary" },
  return: { label: "Return", variant: "outline" },
};

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const productId = parseInt(id, 10);

  if (isNaN(productId)) {
    notFound();
  }

  const result = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (result.length === 0) {
    notFound();
  }

  const product = result[0];

  // Fetch recent inventory transactions
  const transactions = await db
    .select({
      id: inventoryTransactions.id,
      type: inventoryTransactions.type,
      quantity: inventoryTransactions.quantity,
      referenceType: inventoryTransactions.referenceType,
      notes: inventoryTransactions.notes,
      createdAt: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .where(eq(inventoryTransactions.productId, productId))
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(50);

  function formatPrice(value: string | null): string {
    if (!value) return "—";
    const num = parseFloat(value);
    return isNaN(num) ? "—" : `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  }

  const isLowStock = product.quantityOnHand <= product.reorderLevel;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/products">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {product.name}
              </h1>
              <Badge variant={product.isActive ? "default" : "secondary"}>
                {product.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            {product.sku && (
              <p className="text-muted-foreground mt-1 font-mono text-sm">
                SKU: {product.sku}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StockAdjustmentDialog productId={product.id} productName={product.name} />
          <ProductDialog product={product} />
        </div>
      </div>

      {/* Stock Alert */}
      {isLowStock && product.quantityOnHand > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-800 text-sm">
          ⚠️ Low stock alert — current quantity ({product.quantityOnHand}) is at or below reorder level ({product.reorderLevel}).
        </div>
      )}
      {product.quantityOnHand <= 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-800 text-sm">
          🚫 Out of stock — no units available.
        </div>
      )}

      {/* Details Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Product Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Product Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {product.category && (
              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="text-sm">{product.category}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Package className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Unit</p>
                <p className="text-sm">{product.unit}</p>
              </div>
            </div>
            {product.description && (
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="text-sm whitespace-pre-wrap mt-1">{product.description}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Added</p>
              <p className="text-sm">
                {product.createdAt
                  ? new Date(product.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Stock */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pricing & Stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Purchase Price</p>
                <p className="text-sm font-medium">{formatPrice(product.purchasePrice)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Selling Price</p>
                <p className="text-sm font-medium">{formatPrice(product.sellingPrice)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Quantity on Hand</p>
                <p className={`text-2xl font-bold ${isLowStock ? "text-amber-600" : ""}`}>
                  {product.quantityOnHand}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reorder Level</p>
                <p className="text-sm">{product.reorderLevel}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Inventory Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No inventory transactions yet.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((txn) => {
                    const typeConfig = TRANSACTION_TYPE_LABELS[txn.type] ?? { label: txn.type, variant: "outline" as const };
                    return (
                      <TableRow key={txn.id}>
                        <TableCell className="text-sm">
                          {txn.createdAt
                            ? new Date(txn.createdAt).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={typeConfig.variant}>{typeConfig.label}</Badge>
                        </TableCell>
                        <TableCell className={`text-right font-mono ${txn.quantity > 0 ? "text-green-600" : "text-red-600"}`}>
                          {txn.quantity > 0 ? `+${txn.quantity}` : txn.quantity}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {txn.referenceType ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                          {txn.notes ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
