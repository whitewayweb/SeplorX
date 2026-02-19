"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, XCircle, Bot } from "lucide-react";
import { approveReorderPlan, dismissAgentTask } from "@/app/agents/actions";
import type { ReorderPlan } from "@/lib/agents/tools/inventory-tools";

type Props = {
  taskId: number;
  plan: ReorderPlan;
  createdAt: Date | null;
};

export function ReorderApprovalCard({ taskId, plan, createdAt }: Props) {
  const [approveState, approveAction, approving] = useActionState(approveReorderPlan, null);
  const [dismissState, dismissAction, dismissing] = useActionState(dismissAgentTask, null);

  const totalEstimate = plan.items.reduce(
    (sum, item) => sum + item.quantity * parseFloat(item.unitPrice),
    0,
  );

  const formattedTotal = `₹${totalEstimate.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-base">AI Reorder Recommendation</CardTitle>
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-100">
              Pending Approval
            </Badge>
          </div>
          {createdAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(createdAt).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Supplier: <span className="font-medium text-foreground">{plan.companyName}</span>
          {" · "}
          Estimated total: <span className="font-medium text-foreground">{formattedTotal}
          </span>
        </p>
        {plan.reasoning && (
          <p className="text-xs text-muted-foreground italic mt-1">{plan.reasoning}</p>
        )}
      </CardHeader>

      <CardContent className="pb-3">
        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Rationale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.items.map((item) => {
                const lineTotal = item.quantity * parseFloat(item.unitPrice);
                return (
                  <TableRow key={item.productId}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell className="font-mono text-sm">{item.sku ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {item.quantity} {item.unit}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ₹{parseFloat(item.unitPrice).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ₹{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-48 truncate">
                      {item.rationale}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <CardFooter className="gap-3 flex-wrap">
        <form action={approveAction}>
          <input type="hidden" name="taskId" value={taskId} />
          <Button
            type="submit"
            size="sm"
            disabled={approving || dismissing}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {approving ? "Creating draft…" : "Approve & Create Draft Invoice"}
          </Button>
        </form>

        <form action={dismissAction}>
          <input type="hidden" name="taskId" value={taskId} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={approving || dismissing}
          >
            <XCircle className="h-4 w-4 mr-2" />
            {dismissing ? "Dismissing…" : "Dismiss"}
          </Button>
        </form>

        {approveState && "error" in approveState && (
          <p className="text-sm text-destructive w-full">{approveState.error}</p>
        )}
        {approveState && "success" in approveState && (
          <p className="text-sm text-green-700 w-full">
            Draft invoice {approveState.invoiceNumber} created successfully.
          </p>
        )}
        {dismissState && "error" in dismissState && (
          <p className="text-sm text-destructive w-full">{dismissState.error}</p>
        )}
      </CardFooter>
    </Card>
  );
}
