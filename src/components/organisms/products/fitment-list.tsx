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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Info, Search, ChevronRight, ChevronDown, LayoutList, LayoutGrid, FileImage, FileText } from "lucide-react";
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
  children?: React.ReactNode;
}

export function FitmentList({ rules, children }: FitmentListProps) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const handleExport = async (format: 'jpg' | 'pdf') => {
    const el = document.getElementById("matrix-export-view");
    if (!el) return;
    
    if (format === 'jpg') setIsExportingImage(true);
    else setIsExportingPDF(true);

    try {
      const domToImageModule = await import("dom-to-image-more");
      const domToImage = (domToImageModule.default || domToImageModule) as typeof import("dom-to-image-more").default;
      
      // Yield to let React render loading state
      await new Promise(r => setTimeout(r, 100));

      const imgWidth = el.scrollWidth;
      const imgHeight = el.scrollHeight;
      
      // scale by 2 for higher resolution export
      const imgData = await domToImage.toJpeg(el, { 
        bgcolor: "#ffffff", 
        quality: 1.0,
        width: imgWidth * 2,
        height: imgHeight * 2,
        style: {
          transform: "scale(2)",
          transformOrigin: "top left",
          width: `${imgWidth}px`,
          height: `${imgHeight}px`
        }
      });
      
      const dateStr = new Date().toISOString().split("T")[0];

      if (format === 'jpg') {
        const link = document.createElement("a");
        link.href = imgData;
        link.download = `fitment_matrix_${dateStr}.jpg`;
        link.click();
      } else {
        const jsPDFModule = await import("jspdf");
        const jsPDFFn = jsPDFModule.jsPDF || jsPDFModule.default;
        
        const pdf = new jsPDFFn({
          orientation: imgWidth > imgHeight ? "landscape" : "portrait",
          unit: "px", // Use px to match DOM proportions
          format: [imgWidth, imgHeight]
        });
        pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
        pdf.save(`fitment_matrix_${dateStr}.pdf`);
      }
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : String(e);
      alert("Failed to export matrix: " + message);
    } finally {
      setIsExportingImage(false);
      setIsExportingPDF(false);
    }
  };

  const makes = useMemo(() => Array.from(new Set(rules.map(r => r.make))).sort(), [rules]);

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

  const matrixData = useMemo(() => {
    const result: Record<string, Record<string, { front?: string; rear?: string }>> = {};
    for (const rule of filteredRules) {
      if (!result[rule.make]) result[rule.make] = {};
      if (!result[rule.make][rule.model]) result[rule.make][rule.model] = {};

      const mod = result[rule.make][rule.model];

      if (rule.position === "Front" || rule.position === "Both4Pc") {
        const existing = mod.front ? mod.front.split(", ") : [];
        if (!existing.includes(rule.series)) existing.push(rule.series);
        mod.front = existing.join(", ");
      }

      if (rule.position === "Rear" || rule.position === "Both4Pc") {
        const existing = mod.rear ? mod.rear.split(", ") : [];
        if (!existing.includes(rule.series)) existing.push(rule.series);
        mod.rear = existing.join(", ");
      }
    }
    return result;
  }, [filteredRules]);

  const toggleGroup = (make: string) => {
    setExpandedGroups((prev) => {
      const next = new Set<string>();
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

  const isSearchActive = search.trim().length > 0;

  return (
    <Tabs defaultValue="list" className="w-full space-y-4">
      {/* Search Bar & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search make, model, or series..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-center gap-4">
          <span className="text-sm text-muted-foreground mr-auto sm:mr-0">
            Showing {filteredRules.length} rule(s)
          </span>
          <TabsList className="bg-card border border-border/40 shadow-sm grow-0 self-end sm:self-auto">
            <TabsTrigger value="list" className="px-4 py-1.5 flex items-center gap-2">
              <LayoutList className="h-4 w-4" />
              List
            </TabsTrigger>
            <TabsTrigger value="matrix" className="px-4 py-1.5 flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              Matrix
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      <TabsContent value="list" className="m-0 focus-visible:outline-none">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 rounded-xl border border-border/60 bg-card overflow-hidden">
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
                                <FitmentDialog rule={rule} makes={makes} rules={rules} />
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

          {/* Sidebar Area rendering children (How It Works) */}
          {children && (
            <div className="space-y-4">
              {children}
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="matrix" className="m-0 focus-visible:outline-none">
        {filteredRules.length === 0 ? (
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden p-8 text-center text-muted-foreground">
            No rules match &quot;{search}&quot;
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-3 mb-2">
              <Button size="sm" variant="outline" className="h-8 gap-2 border-border/60" onClick={() => handleExport('jpg')} disabled={isExportingImage || isExportingPDF}>
                {isExportingImage ? <span className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" /> : <FileImage className="h-3.5 w-3.5" />}
                Save as Image
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-2 border-border/60" onClick={() => handleExport('pdf')} disabled={isExportingImage || isExportingPDF}>
                {isExportingPDF ? <span className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" /> : <FileText className="h-3.5 w-3.5" />}
                Save as PDF
              </Button>
            </div>
          
            <div id="matrix-export-view" className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6 p-4 rounded-xl bg-background border border-transparent">
              {groupKeys.map(make => {
              const models = matrixData[make];
              const modelKeys = Object.keys(models).sort();
              return (
                <div key={make} className="break-inside-avoid inline-block w-full mb-6 rounded-lg border border-border/60 bg-card shadow-sm relative overflow-hidden">
                  <div className="bg-muted/30 p-2.5 border-b border-border/60 text-center flex items-center justify-center gap-2">
                    <h3 className="font-bold text-sm tracking-wide uppercase">{make}</h3>
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 opacity-70">
                      {grouped[make].length} items
                    </Badge>
                  </div>
                  <Table className="text-sm">
                    <TableHeader className="bg-transparent">
                      <TableRow className="hover:bg-transparent border-b">
                        <TableHead className="h-8 font-semibold"></TableHead>
                        <TableHead className="h-8 font-semibold w-[60px] text-center text-xs text-muted-foreground border-l border-border/30 px-1">FRONT</TableHead>
                        <TableHead className="h-8 font-semibold w-[60px] text-center text-xs text-muted-foreground border-l border-border/30 px-1">REAR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modelKeys.map(model => (
                        <TableRow key={model} className="hover:bg-muted/20">
                          <TableCell className="py-2.5 font-medium leading-snug whitespace-normal break-words pr-2">{model}</TableCell>
                          <TableCell className="py-2.5 text-center border-l border-border/30">
                            <span className="font-medium text-muted-foreground">
                              {models[model].front || "-"}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 text-center border-l border-border/30">
                            <span className="font-medium text-muted-foreground">
                              {models[model].rear || "-"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
