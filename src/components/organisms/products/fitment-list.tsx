"use client";

import { useState, useMemo, useTransition, Fragment } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Info, Search, ChevronRight, ChevronDown } from "lucide-react";
import type { FitmentRule } from "@/data/fitment";
import { FitmentDialog } from "./fitment-dialog";
import { deleteFitmentRule } from "@/app/(dashboard)/products/fitment/actions";

const POSITION_STYLES: Record<string, string> = {
  Front: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/40",
  Rear: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800/40",
  Both4Pc: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/40",
};

const SERIES_STYLES: Record<string, string> = {
  A: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300",
  B: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300",
  C: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300",
  D: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300",
  E: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300",
};

interface FitmentListProps {
  rules: FitmentRule[];
}

export function FitmentList({ rules }: FitmentListProps) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this rule?")) {
      startTransition(async () => {
        await deleteFitmentRule(id);
      });
    }
  };

  const filteredRules = useMemo(() => {
    if (!search.trim()) return rules;
    const lowerQuery = search.toLowerCase();
    return rules.filter(
      (r) =>
        r.make.toLowerCase().includes(lowerQuery) ||
        r.model.toLowerCase().includes(lowerQuery) ||
        r.series.toLowerCase().includes(lowerQuery)
    );
  }, [rules, search]);

  const grouped = useMemo(() => {
    return filteredRules.reduce<Record<string, FitmentRule[]>>((acc, rule) => {
      if (!acc[rule.make]) acc[rule.make] = [];
      acc[rule.make].push(rule);
      return acc;
    }, {});
  }, [filteredRules]);

  const groupKeys = Object.keys(grouped).sort();

  const toggleGroup = (make: string) => {
    setExpandedGroups((prev) => {
      const next = new Set<string>();
      // If it wasn't already open, open it (and close others by virtue of a new isolated Set)
      if (!prev.has(make)) {
        next.add(make);
      }
      return next;
    });
  };


  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-dashed border-border/60">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Info className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground font-medium text-lg">No fitment rules found</p>
        <p className="text-sm text-muted-foreground mt-1 text-center max-w-sm">
          Add rules manually or use &quot;Seed from Chart&quot; to populate from the Hiya Automotive compatibility charts.
        </p>
      </div>
    );
  }

  // If search is active, we should expand all results to show them.
  // Otherwise respect the expandedGroups set.
  const isSearchActive = search.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Search Bar & Controls */}
      <div className="flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search make, model, or series..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Showing {filteredRules.length} rule(s)
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        {filteredRules.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No rules match &quot;{search}&quot;
          </div>
        ) : (
          <div className="max-h-[700px] overflow-y-auto">
            <Table>
              <TableHeader className="bg-card sticky top-0 z-10 shadow-sm">
                <TableRow className="border-b">
                  <TableHead className="w-[300px] pl-6">Make / Model</TableHead>
                  <TableHead className="w-[120px]">Years</TableHead>
                  <TableHead className="w-[120px]">Position</TableHead>
                  <TableHead className="w-[120px]">Series</TableHead>
                  <TableHead className="text-right w-[100px] pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupKeys.map((make) => {
                  const makeRules = grouped[make];
                  const isExpanded = isSearchActive || expandedGroups.has(make);
                  
                  return (
                    <Fragment key={`group-${make}`}>
                      {/* Section Header for Make */}
                      <TableRow 
                        className="bg-muted/40 hover:bg-muted/60 sticky top-10 z-[5] cursor-pointer transition-colors"
                        onClick={() => !isSearchActive && toggleGroup(make)}
                      >
                        <TableCell colSpan={5} className="py-2 pl-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {!isSearchActive && (
                                isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )
                              )}
                              <h3 className="font-semibold text-sm">{make}</h3>
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 opacity-70">
                                {makeRules.length} items
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                      
                      {/* Rules for Make (collapsible) */}
                      {isExpanded && makeRules.map((rule) => (
                        <TableRow key={rule.id} className="hover:bg-muted/20">
                          <TableCell className="font-medium pl-[44px] border-l-2 border-transparent hover:border-primary/50 transition-colors">
                            {rule.model}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {rule.yearStart || rule.yearEnd ? (
                              <span className="tabular-nums text-xs">
                                {rule.yearStart || "—"} &ndash; {rule.yearEnd || "—"}
                              </span>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] uppercase font-semibold h-5 bg-background">
                                All Years
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={POSITION_STYLES[rule.position] ?? ""}>
                              {rule.position === "Both4Pc" ? "Both (4pc)" : rule.position}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={SERIES_STYLES[rule.series] ?? ""}>
                              Series {rule.series}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-4 space-x-1">
                            <FitmentDialog rule={rule} />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(rule.id);
                              }}
                              disabled={isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
