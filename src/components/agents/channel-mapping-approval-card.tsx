"use client";

import { useActionState, useState } from "react";
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
import { CheckCircle, XCircle, Bot, ChevronDown, ChevronUp, Info } from "lucide-react";
import { approveChannelMappings, dismissAgentTask } from "@/app/agents/actions";
import type { ChannelMappingPlan } from "@/lib/agents/tools/channel-mapping-tools";

type Props = {
  taskId: number;
  plan: ChannelMappingPlan;
  createdAt: Date | null;
};

const CONFIDENCE_CONFIG: Record<
  "high" | "medium" | "low",
  { label: string; className: string }
> = {
  high: { label: "High", className: "bg-green-100 text-green-800 hover:bg-green-100" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
  low: { label: "Low", className: "bg-red-100 text-red-700 hover:bg-red-100" },
};

export function ChannelMappingApprovalCard({ taskId, plan, createdAt }: Props) {
  const [approveState, approveAction, approving] = useActionState(approveChannelMappings, null);
  const [dismissState, dismissAction, dismissing] = useActionState(dismissAgentTask, null);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Bot className="h-5 w-5 text-amber-600 shrink-0" />
            <CardTitle className="text-base">
              AI Product Mapping — {plan.channelName}
            </CardTitle>
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-100">
              Pending Approval
            </Badge>
          </div>
          {createdAt && (
            <span className="text-xs text-muted-foreground shrink-0">
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
          {plan.proposals.length} proposal{plan.proposals.length !== 1 ? "s" : ""}
          {plan.unmatched.length > 0 && ` · ${plan.unmatched.length} unmatched`}
        </p>

        {/* Collapsible reasoning */}
        {plan.reasoning && (
          <button
            type="button"
            onClick={() => setReasoningExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
          >
            {reasoningExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {reasoningExpanded ? "Hide reasoning" : "Show reasoning"}
          </button>
        )}
        {reasoningExpanded && (
          <p className="text-xs text-muted-foreground italic mt-1">{plan.reasoning}</p>
        )}
      </CardHeader>

      <CardContent className="pb-3 space-y-4">
        {/* Proposals table */}
        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SeplorX Product</TableHead>
                <TableHead>WooCommerce Product</TableHead>
                <TableHead>WC SKU</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Rationale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.proposals.map((p, i) => {
                const conf = CONFIDENCE_CONFIG[p.confidence];
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="font-medium text-sm">{p.seplorxProductName}</div>
                      {p.seplorxSku && (
                        <div className="font-mono text-xs text-muted-foreground">{p.seplorxSku}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{p.externalProductName}</div>
                      <div className="font-mono text-xs text-muted-foreground">ID: {p.externalProductId}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {p.externalSku ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-xs ${conf.className}`}>
                        {conf.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-48 truncate" title={p.rationale}>
                      {p.rationale}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Unmatched WC products */}
        {plan.unmatched.length > 0 && (
          <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50/50 p-3">
            <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-blue-700 mb-1">
                {plan.unmatched.length} WooCommerce product{plan.unmatched.length !== 1 ? "s" : ""} had no match
              </p>
              <p className="text-xs text-blue-600">
                Consider creating SeplorX products for:{" "}
                <span className="font-medium">{plan.unmatched.join(", ")}</span>
              </p>
            </div>
          </div>
        )}
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
            {approving ? "Applying…" : `Approve & Map ${plan.proposals.length} Product${plan.proposals.length !== 1 ? "s" : ""}`}
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
        {approveState && "mapped" in approveState && (
          <p className="text-sm text-green-700 w-full">
            {approveState.mapped} mapping{approveState.mapped !== 1 ? "s" : ""} applied
            {(approveState.skipped ?? 0) > 0 && `, ${approveState.skipped} already existed`}.
          </p>
        )}
        {dismissState && "error" in dismissState && (
          <p className="text-sm text-destructive w-full">{dismissState.error}</p>
        )}
      </CardFooter>
    </Card>
  );
}
