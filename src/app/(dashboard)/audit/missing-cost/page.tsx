import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TablePagination } from "@/components/ui/table-pagination";
import { TableSearch } from "@/components/ui/table-search";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { SalesCostAuditTable } from "@/components/organisms/dashboard/sales-cost-audit-table";
import { getMissingCostAudit, getProductMappingOptions } from "@/data/sales-cost-audit";
import { getAuthenticatedUserId } from "@/lib/auth";
import { parsePaginationParams } from "@/lib/utils/pagination";

export const dynamic = "force-dynamic";

export default async function MissingCostAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const { query, page, limit, offset } = parsePaginationParams(resolvedSearchParams);
  const userId = await getAuthenticatedUserId();
  const [audit, products] = await Promise.all([
    getMissingCostAudit(userId, { search: query, limit, offset }),
    getProductMappingOptions(),
  ]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Sales Cost Audit"
        description="Review sales that still cannot contribute to known-cost P&L."
      >
        <Button variant="outline" asChild>
          <Link href="/" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Rows needing review" value={audit.totals.rowCount.toLocaleString("en-IN")} />
        <Metric title="Affected revenue" value={formatCurrency(Number(audit.totals.revenue))} />
        <Metric title="Order lines" value={audit.totals.lineItems.toLocaleString("en-IN")} />
        <Metric title="Order touches" value={audit.totals.orderCount.toLocaleString("en-IN")} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TableSearch placeholder="Search listing, SKU, product..." />
        <p className="text-sm text-muted-foreground">
          Resolve rows by mapping the channel listing to the correct SeplorX product.
        </p>
      </div>

      <SalesCostAuditTable rows={audit.rows} products={products} />

      <TablePagination totalItems={audit.totalCount} itemsPerPage={limit} currentPage={page} />
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
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
