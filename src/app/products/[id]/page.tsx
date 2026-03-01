import { db } from "@/db";
import { products, inventoryTransactions, channels, channelProductMappings } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  Tag,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Ban,
  ShoppingCart,
  Banknote,
  Layers,
  RefreshCw,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductDialog } from "@/components/products/product-dialog";
import { StockAdjustmentDialog } from "@/components/products/stock-adjustment-dialog";
import { ChannelSyncCard } from "@/components/products/channel-sync-card";

export const dynamic = "force-dynamic";

const CURRENT_USER_ID = 1;

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

const TRANSACTION_TYPE_CONFIG: Record<
  string,
  {
    label: string;
    className: string;
  }
> = {
  purchase_in: {
    label: "Purchase In",
    className: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40",
  },
  sale_out: {
    label: "Sale Out",
    className: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40",
  },
  adjustment: {
    label: "Adjustment",
    className: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40",
  },
  return: {
    label: "Return",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40",
  },
};

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const productId = parseInt(id, 10);

  if (isNaN(productId)) notFound();

  const result = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (result.length === 0) notFound();

  const product = result[0];

  const connectedChannels = await db
    .select({ id: channels.id, channelType: channels.channelType, name: channels.name })
    .from(channels)
    .where(and(eq(channels.userId, CURRENT_USER_ID), eq(channels.status, "connected")));

  const mappings = await db
    .select({
      id: channelProductMappings.id,
      channelId: channelProductMappings.channelId,
      externalProductId: channelProductMappings.externalProductId,
      label: channelProductMappings.label,
    })
    .from(channelProductMappings)
    .where(eq(channelProductMappings.productId, productId));

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

  const isOutOfStock = product.quantityOnHand <= 0;
  const isLowStock = !isOutOfStock && product.quantityOnHand <= product.reorderLevel;

  const stockColor = isOutOfStock
    ? "text-red-600 dark:text-red-400"
    : isLowStock
      ? "text-amber-500 dark:text-amber-400"
      : "text-emerald-600 dark:text-emerald-400";

  const stockBg = isOutOfStock
    ? "from-red-500/10 to-red-500/5"
    : isLowStock
      ? "from-amber-500/10 to-amber-500/5"
      : "from-emerald-500/10 to-emerald-500/5";

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Page Header ─── */}
      <div className="border-b border-border/50 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="h-8 w-8 rounded-lg shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Link href="/products">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-base font-semibold truncate leading-tight">{product.name}</h1>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${product.isActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/40"
                    : "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                    }`}
                >
                  {product.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              {product.sku && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">SKU: {product.sku}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StockAdjustmentDialog productId={product.id} productName={product.name} />
            <ProductDialog product={product} />
          </div>
        </div>
      </div>

      <div className="mx-auto px-6 py-6 space-y-6">

        {/* ─── Alerts ─── */}
        {(isOutOfStock || isLowStock) && (
          <div
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${isOutOfStock
              ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50"
              : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50"
              }`}
          >
            {isOutOfStock ? (
              <Ban className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            {isOutOfStock
              ? "Out of stock — no units currently available."
              : `Low stock alert — only ${product.quantityOnHand} unit${product.quantityOnHand !== 1 ? "s" : ""} remaining (reorder at ${product.reorderLevel}).`}
          </div>
        )}

        {/* ─── Stat Cards Row ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Purchase Price */}
          <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-7 w-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
                <Banknote className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-xs font-medium">Purchase Price</span>
            </div>
            <p className="text-xl font-bold tracking-tight">{formatPrice(product.purchasePrice)}</p>
          </div>

          {/* Selling Price */}
          <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-7 w-7 rounded-lg bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center">
                <ShoppingCart className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <span className="text-xs font-medium">Selling Price</span>
            </div>
            <p className="text-xl font-bold tracking-tight">{formatPrice(product.sellingPrice)}</p>
          </div>

          {/* Quantity on Hand */}
          <div className={`rounded-xl border border-border/60 bg-gradient-to-br ${stockBg} bg-card p-4 space-y-2`}>
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-7 w-7 rounded-lg bg-background/70 flex items-center justify-center">
                <Layers className={`h-3.5 w-3.5 ${stockColor}`} />
              </div>
              <span className="text-xs font-medium">Qty on Hand</span>
            </div>
            <p className={`text-3xl font-bold tracking-tight tabular-nums ${stockColor}`}>
              {product.quantityOnHand}
            </p>
          </div>

          {/* Reorder Level */}
          <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
                <RefreshCw className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xs font-medium">Reorder Level</span>
            </div>
            <p className="text-3xl font-bold tracking-tight tabular-nums">{product.reorderLevel}</p>
          </div>
        </div>

        {/* ─── Product Details ─── */}
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-border/40">
            <h2 className="text-sm font-semibold">Product Details</h2>
          </div>
          <div className="divide-y divide-border/40">
            {product.category && (
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" />
                  Category
                </span>
                <span className="text-sm font-medium">{product.category}</span>
              </div>
            )}
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                Unit
              </span>
              <span className="text-sm font-medium">{product.unit}</span>
            </div>
            {product.description && (
              <div className="px-5 py-3.5 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Description</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{product.description}</p>
              </div>
            )}
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                Added
              </span>
              <span className="text-sm font-medium">
                {product.createdAt
                  ? new Date(product.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* ─── Channel Sync ─── */}
        <ChannelSyncCard
          productId={productId}
          connectedChannels={connectedChannels}
          mappings={mappings}
        />

        {/* ─── Inventory Transactions ─── */}
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Inventory Transactions</h2>
            {transactions.length > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {transactions.length} record{transactions.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center">
                <Layers className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">No transactions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/30">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Type</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Qty</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Source</th>
                    <th className="text-left px-4 py-2.5 pr-5 text-xs font-semibold text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {transactions.map((txn) => {
                    const cfg = TRANSACTION_TYPE_CONFIG[txn.type] ?? {
                      label: txn.type,
                      className:
                        "bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
                    };
                    return (
                      <tr key={txn.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                          {txn.createdAt
                            ? new Date(txn.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`inline-flex items-center justify-end gap-1 font-mono font-semibold tabular-nums ${txn.quantity > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                              }`}
                          >
                            {txn.quantity > 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {txn.quantity > 0 ? `+${txn.quantity}` : txn.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{txn.referenceType ?? "—"}</td>
                        <td className="px-4 py-3 pr-5 text-muted-foreground max-w-[200px] truncate">
                          {txn.notes ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
