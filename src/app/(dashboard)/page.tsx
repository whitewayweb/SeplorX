import { getOutOfSyncProductCount, getOrdersAwaitingReturnAction } from "@/data/stock";
import Link from "next/link";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [outOfSyncCount, returnsAwaiting] = await Promise.all([
    getOutOfSyncProductCount(),
    getOrdersAwaitingReturnAction(),
  ]);

  return (
    <div className="py-6 md:py-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome to SeplorX. Here is an overview of your stock alerts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Out of Sync Stock</CardTitle>
            <AlertCircle className={`h-4 w-4 ${outOfSyncCount > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{outOfSyncCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Products with stock reserved but not pushed
            </p>
            {outOfSyncCount > 0 && (
              <div className="mt-4">
                <Link href="/inventory" className="text-sm text-blue-600 hover:underline">
                  Review & Push Stock →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Returns Awaiting Action</CardTitle>
            <RotateCcw className={`h-4 w-4 ${returnsAwaiting.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{returnsAwaiting.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Orders with items pending restock/discard
            </p>
            {returnsAwaiting.length > 0 && (
              <div className="mt-4">
                <Link href="/orders?status=returned" className="text-sm text-blue-600 hover:underline">
                  Process Returns →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
