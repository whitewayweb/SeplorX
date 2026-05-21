"use client";

import { useState, useMemo } from "react";
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
import { Info, Search, FileImage, FileText } from "lucide-react";
import type { FitmentRule } from "@/data/fitment";
import { FitmentDialog } from "./fitment-dialog";

interface FitmentListProps {
  rules: FitmentRule[];
}

export function FitmentList({ rules }: FitmentListProps) {
  const [search, setSearch] = useState("");
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
    const result: Record<string, Record<string, { front: FitmentRule[]; rear: FitmentRule[] }>> = {};
    for (const rule of filteredRules) {
      if (!result[rule.make]) result[rule.make] = {};
      if (!result[rule.make][rule.model]) result[rule.make][rule.model] = { front: [], rear: [] };

      const mod = result[rule.make][rule.model];

      if (rule.position === "Front" || rule.position === "Both4Pc") {
        if (!mod.front.some((existingRule) => existingRule.id === rule.id)) mod.front.push(rule);
      }

      if (rule.position === "Rear" || rule.position === "Both4Pc") {
        if (!mod.rear.some((existingRule) => existingRule.id === rule.id)) mod.rear.push(rule);
      }
    }

    for (const make of Object.keys(result)) {
      for (const model of Object.keys(result[make])) {
        result[make][model].front.sort((a, b) => a.series.localeCompare(b.series));
        result[make][model].rear.sort((a, b) => a.series.localeCompare(b.series));
      }
    }

    return result;
  }, [filteredRules]);

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

  return (
    <div className="w-full space-y-4">
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
        </div>
      </div>

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
                            <MatrixSeriesCell
                              rules={models[model].front}
                              make={make}
                              model={model}
                              position="Front"
                              makes={makes}
                              allRules={rules}
                            />
                          </TableCell>
                          <TableCell className="py-2.5 text-center border-l border-border/30">
                            <MatrixSeriesCell
                              rules={models[model].rear}
                              make={make}
                              model={model}
                              position="Rear"
                              makes={makes}
                              allRules={rules}
                            />
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
    </div>
  );
}

function MatrixSeriesCell({
  rules,
  make,
  model,
  position,
  makes,
  allRules,
}: {
  rules: FitmentRule[];
  make: string;
  model: string;
  position: FitmentRule["position"];
  makes: string[];
  allRules: FitmentRule[];
}) {
  if (rules.length === 0) {
    return (
      <span className="group/series inline-flex min-h-7 items-center justify-center gap-0.5 rounded-md px-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted">
        <span>-</span>
        <FitmentDialog
          initialValues={{ make, model, position }}
          makes={makes}
          rules={allRules}
          triggerClassName="h-5 w-5 opacity-0 transition-opacity group-hover/series:opacity-100 focus:opacity-100"
        />
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {rules.map((rule) => {
        const subLabel = formatRuleSubLabel(rule);

        return (
          <span
            key={rule.id}
            className="group/series inline-flex min-h-7 items-center justify-center gap-0.5 rounded-md px-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted"
            title={formatRuleTitle(rule)}
          >
            <span className="flex flex-col items-center leading-tight">
              <span>{rule.series || "Set"}</span>
              {subLabel ? (
                <span className="text-[10px] font-normal text-muted-foreground/80">
                  {subLabel}
                </span>
              ) : null}
            </span>
            <FitmentDialog
              rule={rule}
              makes={makes}
              rules={allRules}
              triggerClassName="h-5 w-5 opacity-0 transition-opacity group-hover/series:opacity-100 focus:opacity-100"
            />
          </span>
        );
      })}
    </div>
  );
}

function formatRuleSubLabel(rule: FitmentRule) {
  return formatYearRange(rule) || (!rule.series ? "all" : "");
}

function formatYearRange(rule: FitmentRule) {
  if (rule.yearStart && rule.yearEnd) return `${rule.yearStart}-${rule.yearEnd}`;
  if (rule.yearStart) return `${rule.yearStart}+`;
  if (rule.yearEnd) return `-${rule.yearEnd}`;
  return "";
}

function formatRuleTitle(rule: FitmentRule) {
  const yearRange = formatYearRange(rule);
  return [
    rule.make,
    rule.model,
    rule.position,
    yearRange || "all years",
    rule.series ? `Series ${rule.series}` : "Series pending",
  ].join(" | ");
}
