import Link from "next/link";

// ─── Type Config ──────────────────────────────────────────────────────────────

const TRANSACTION_TYPE_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  purchase_in: {
    label: "Purchase In",
    className:
      "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40",
  },
  sale_out: {
    label: "Sale Out",
    className:
      "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40",
  },
  sale_reserve: {
    label: "Reserved",
    className:
      "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/40",
  },
  sale_cancel: {
    label: "Released",
    className:
      "bg-zinc-50 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/40",
  },
  return_restock: {
    label: "Restocked",
    className:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40",
  },
  return_discard: {
    label: "Discarded",
    className:
      "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 border border-orange-200/60 dark:border-orange-800/40",
  },
  adjustment: {
    label: "Adjustment",
    className:
      "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40",
  },
  return: {
    label: "Return",
    className:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40",
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface InventoryTransaction {
  id: number;
  type: string;
  quantity: number;
  referenceType: string | null;
  referenceId: number | null;
  notes: string | null;
  createdAt: Date | null;
  /** Product name — only used on the full inventory page (multi-product view) */
  productName?: string;
  /** Product ID — only used on the full inventory page */
  productId?: number;
  /** Company ID — only used for purchase_invoice linking */
  companyId?: number | null;
}

interface InventoryTransactionsTableProps {
  transactions: InventoryTransaction[];
  /** Show the "Product" column (used on the /inventory page, hidden on product detail) */
  showProduct?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Reusable inventory transactions table used on both `/inventory`
 * (full page — with product column) and `/products/[id]` (detail page).
 */
export function InventoryTransactionsTable({
  transactions,
  showProduct = false,
}: InventoryTransactionsTableProps) {
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No inventory transactions yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40 bg-muted/30">
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground">
              Date
            </th>
            {showProduct && (
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                Product
              </th>
            )}
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
              Type
            </th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">
              Qty
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
              Source
            </th>
            <th className="text-left px-4 py-2.5 pr-5 text-xs font-semibold text-muted-foreground">
              Notes
            </th>
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
                {showProduct && (
                  <td className="px-4 py-3">
                    {txn.productId ? (
                      <Link
                        href={`/products/${txn.productId}`}
                        className="font-medium hover:underline"
                      >
                        {txn.productName}
                      </Link>
                    ) : (
                      txn.productName ?? "—"
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}
                  >
                    {cfg.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`inline-flex items-center justify-end gap-1 font-mono font-semibold tabular-nums ${
                      txn.quantity > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {txn.quantity > 0 ? `+${txn.quantity}` : txn.quantity}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {txn.referenceType === "purchase_invoice" &&
                    txn.companyId && (
                      <Link
                        href={`/companies/${txn.companyId}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline block text-xs mb-1"
                      >
                        View Vendor
                      </Link>
                    )}
                  {txn.referenceType ?? "—"}
                </td>
                <td className="px-4 py-3 pr-5 text-muted-foreground">
                  <NotesCell txn={txn} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Notes Cell ───────────────────────────────────────────────────────────────

function NotesCell({ txn }: { txn: InventoryTransaction }) {
  // sales_order notes: link the order reference
  if (txn.referenceType === "sales_order" && txn.referenceId) {
    const orderLink = (
      <Link
        href={`/orders/${txn.referenceId}`}
        className="text-primary hover:underline"
      >
        order #{txn.referenceId}
      </Link>
    );

    // Strip the "order #NNN" from notes text and append the link
    const noteText = txn.notes?.replace(/order #\d+/, "").trim();
    return (
      <span>
        {noteText} {orderLink}
      </span>
    );
  }

  // purchase_invoice notes: link to invoice
  if (txn.referenceType === "purchase_invoice" && txn.referenceId && txn.notes) {
    return (
      <Link
        href={`/invoices/${txn.referenceId}`}
        className="text-blue-600 dark:text-blue-400 hover:underline"
      >
        {txn.notes}
      </Link>
    );
  }

  return <>{txn.notes ?? "—"}</>;
}
