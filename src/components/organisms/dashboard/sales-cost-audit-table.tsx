"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { resolveMissingCostMapping, type ResolveMissingCostMappingState } from "@/app/(dashboard)/audit/missing-cost/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MissingCostAuditRow, ProductMappingOption } from "@/data/sales-cost-audit";

interface SalesCostAuditTableProps {
  rows: MissingCostAuditRow[];
  products: ProductMappingOption[];
}

const issueLabels: Record<MissingCostAuditRow["issue"], { label: string; className: string }> = {
  missing_mapping: {
    label: "Needs mapping",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  mapped_without_cost: {
    label: "Mapped, cost missing",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  unmatched_channel_product: {
    label: "No channel listing",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  },
};

export function SalesCostAuditTable({ rows, products }: SalesCostAuditTableProps) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          No missing-cost sales rows found for active orders.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Channel product</TableHead>
            <TableHead>Issue</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">Lines</TableHead>
            <TableHead>Current state</TableHead>
            <TableHead className="min-w-[320px]">Resolve</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.channelId}:${row.externalProductId ?? row.itemSku ?? row.itemTitle}`}>
              <TableCell className="max-w-[420px] whitespace-normal">
                <div className="font-medium text-foreground">
                  {row.channelProductName ?? row.itemTitle ?? "Unknown product"}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{row.channelName}</span>
                  {row.externalProductId && <span>ID {row.externalProductId}</span>}
                  {(row.channelSku || row.itemSku) && <span>SKU {row.channelSku ?? row.itemSku}</span>}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={issueLabels[row.issue].className}>
                  {issueLabels[row.issue].label}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(Number(row.revenue))}
              </TableCell>
              <TableCell className="text-right">
                <div>{row.lineItems}</div>
                <div className="text-xs text-muted-foreground">{row.orderCount} orders</div>
              </TableCell>
              <TableCell className="max-w-[260px] whitespace-normal">
                {row.mappedProductId ? (
                  <div>
                    <div className="font-medium">{row.mappedProductName}</div>
                    <div className="text-xs text-muted-foreground">{row.mappedProductSku}</div>
                  </div>
                ) : row.channelProductId ? (
                  <Button variant="link" className="h-auto p-0 text-xs" asChild>
                    <Link href={`/products/channels/${row.channelId}?q=${encodeURIComponent(row.externalProductId ?? "")}`}>
                      View channel listing
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Order item did not match a fetched channel listing.
                  </div>
                )}
              </TableCell>
              <TableCell>
                {row.issue === "mapped_without_cost" ? (
                  <p className="text-xs text-muted-foreground">
                    Add purchase cost to the mapped product or its bundle components.
                  </p>
                ) : (
                  <ResolveMappingForm row={row} products={products} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ResolveMappingForm({
  row,
  products,
}: {
  row: MissingCostAuditRow;
  products: ProductMappingOption[];
}) {
  const [state, action, pending] = useActionState<ResolveMissingCostMappingState, FormData>(
    resolveMissingCostMapping,
    null,
  );

  useEffect(() => {
    if (!state) return;
    if ("success" in state) toast.success("Mapping resolved", { description: state.message });
    if ("error" in state) toast.error("Could not resolve mapping", { description: state.error });
  }, [state]);

  if (!row.externalProductId) {
    return (
      <p className="text-xs text-muted-foreground">
        No external product ID is available; inspect the source order item first.
      </p>
    );
  }

  return (
    <form action={action} className="flex min-w-[300px] items-center gap-2">
      <input type="hidden" name="channelId" value={row.channelId} />
      <input type="hidden" name="externalProductId" value={row.externalProductId} />
      <input type="hidden" name="label" value={row.channelProductName ?? row.itemTitle ?? ""} />
      <Select name="productId" required disabled={pending}>
        <SelectTrigger className="h-9 min-w-[220px] bg-white">
          <SelectValue placeholder="Select SeplorX product" />
        </SelectTrigger>
        <SelectContent>
          {products.map((product) => (
            <SelectItem key={product.id} value={String(product.id)}>
              {product.sku ? `${product.sku} - ${product.name}` : product.name}
              {product.isBundle ? " (Bundle)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving..." : "Map"}
      </Button>
    </form>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
