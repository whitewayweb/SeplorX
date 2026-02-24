"use client";

import { useActionState, useState, useEffect, useTransition, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, CheckCircle, XCircle, AlertCircle, AlertTriangle, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { approveOcrInvoice, dismissAgentTask } from "@/app/agents/actions";
import { createCompany } from "@/app/companies/actions";
import { createProduct } from "@/app/products/actions";
import type { ExtractedInvoice } from "@/lib/agents/ocr-agent";
import { cn } from "@/lib/utils";

type Supplier = { id: number; name: string; gstNumber: string | null };
type ProductOption = {
  id: number;
  name: string;
  sku: string | null;
  purchasePrice: string | null;
  unit: string;
};

type LinkedItem = {
  productId: string; // "" = unlinked
  description: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
};

type DuplicateInfo = { invoiceDate: string | null; totalAmount: string } | null;

type Props = {
  taskId: number;
  plan: ExtractedInvoice;
  createdAt: Date | null;
  suppliers: Supplier[];
  products: ProductOption[];
  duplicateInfo?: DuplicateInfo;
};

function findSupplierMatch(suppliers: Supplier[], supplierName: string): string {
  const needle = supplierName.toLowerCase();
  const match = suppliers.find(
    (s) =>
      s.name.toLowerCase().includes(needle) ||
      needle.includes(s.name.toLowerCase()),
  );
  return match ? String(match.id) : "";
}

function findProductMatch(products: ProductOption[], description: string, sku: string | null): string {
  if (sku) {
    const skuMatch = products.find((p) => p.sku?.toLowerCase() === sku.toLowerCase());
    if (skuMatch) return String(skuMatch.id);
  }
  const needle = description.toLowerCase();
  const nameMatch = products.find(
    (p) =>
      p.name.toLowerCase().includes(needle) ||
      needle.includes(p.name.toLowerCase()),
  );
  return nameMatch ? String(nameMatch.id) : "";
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Progress indicator ──────────────────────────────────────────────────────────
function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Supplier" },
    { n: 2, label: "Products" },
    { n: 3, label: "Invoice" },
  ];
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, idx) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors",
                current === s.n
                  ? "bg-blue-600 border-blue-600 text-white"
                  : current > s.n
                    ? "bg-blue-100 border-blue-400 text-blue-700"
                    : "bg-white border-muted-foreground/30 text-muted-foreground",
              )}
            >
              {current > s.n ? <CheckCircle className="h-4 w-4" /> : s.n}
            </div>
            <span
              className={cn(
                "text-[10px] mt-0.5 font-medium",
                current === s.n ? "text-blue-700" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={cn(
                "h-0.5 w-10 mb-3 mx-1 transition-colors",
                current > s.n + 1 || (current > s.n)
                  ? "bg-blue-400"
                  : "bg-muted-foreground/20",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function OcrApprovalCard({ taskId, plan, createdAt, suppliers: initialSuppliers, products: initialProducts, duplicateInfo }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [extraProducts, setExtraProducts] = useState<ProductOption[]>([]);
  const allProducts = useMemo(
    () =>
      [...initialProducts, ...extraProducts].filter(
        (v, i, a) => a.findIndex((t) => t.id === v.id) === i,
      ),
    [initialProducts, extraProducts],
  );

  // ── Step 1 — Supplier ─────────────────────────────────────────────────────────
  const preMatchId = findSupplierMatch(initialSuppliers, plan.supplierName);
  const [supplierMode, setSupplierMode] = useState<"existing" | "create">(
    preMatchId ? "existing" : "create",
  );
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(preMatchId);
  // Track name of pending new supplier so we can auto-select after refresh
  const [pendingNewSupplierName, setPendingNewSupplierName] = useState<string | null>(null);
  const [newSupplier, setNewSupplier] = useState({
    name: plan.supplierName ?? "",
    gstNumber: plan.supplierGstNumber ?? "",
    phone: plan.supplierPhone ?? "",
    email: plan.supplierEmail ?? "",
  });
  const [creatingSupplier, startCreatingSupplier] = useTransition();
  const [supplierError, setSupplierError] = useState<string | null>(null);

  // ── Step 2 — Line Items ────────────────────────────────────────────────────────
  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>(() =>
    plan.items.map((item) => ({
      productId: findProductMatch(initialProducts, item.description, item.skuOrItemCode ?? null),
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxPercent: item.taxPercent,
    })),
  );
  const [itemModes, setItemModes] = useState<("existing" | "create")[]>(() =>
    plan.items.map((item) => {
      const matched = findProductMatch(initialProducts, item.description, item.skuOrItemCode ?? null);
      return matched ? "existing" : "create";
    }),
  );
  // Track pending new product names so we auto-link after routing refresh
  const [pendingRefreshNames, setPendingRefreshNames] = useState<(string | null)[]>(plan.items.map(() => null));
  const [newProducts, setNewProducts] = useState(() =>
    plan.items.map((item) => ({
      name: item.description,
      sku: item.skuOrItemCode ?? "",
      unit: item.unitOfMeasure ?? "",
      purchasePrice: String(item.unitPrice),
    })),
  );
  const [creatingItemIdx, setCreatingItemIdx] = useState<number | null>(null);
  const [itemErrors, setItemErrors] = useState<(string | null)[]>(() => plan.items.map(() => null));

  // ── Step 3 — Invoice Details ───────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const [invoiceNumber, setInvoiceNumber] = useState(plan.invoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(plan.invoiceDate ?? today);
  const [dueDate, setDueDate] = useState(plan.dueDate ?? "");
  const [discountAmount, setDiscountAmount] = useState(String(plan.discountAmount ?? 0));
  const [notes, setNotes] = useState("");

  // ── Duplicate overwrite state ──────────────────────────────────────────────────
  const [overwriteDismissed, setOverwriteDismissed] = useState(false);
  const [proceedWithOverwrite, setProceedWithOverwrite] = useState(false);
  const approveFormRef = useRef<HTMLFormElement>(null);
  const overwriteRef = useRef<HTMLInputElement>(null);

  // ── Auto-select newly created supplier after router.refresh() ─────────────────
  useEffect(() => {
    if (!pendingNewSupplierName) return;
    const needle = pendingNewSupplierName.toLowerCase();
    const found = initialSuppliers.find((s) => s.name.toLowerCase() === needle);
    if (found) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedSupplierId(String(found.id));
       
      setSupplierMode("existing");
       
      setPendingNewSupplierName(null);
    }
  }, [initialSuppliers, pendingNewSupplierName]);

  // ── Auto-link newly created products after router.refresh() ──────────────────
  useEffect(() => {
    const hasPending = pendingRefreshNames.some((n) => n !== null);
    if (!hasPending) return;

    // Single pass: resolve each pending name to a found product (or null)
    const resolved = pendingRefreshNames.map((name) =>
      name
        ? (allProducts.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null)
        : null,
    );

    // Nothing found yet (router.refresh still in-flight) — skip all setState
    if (!resolved.some(Boolean)) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkedItems((prev) =>
      prev.map((item, idx) => {
        const match = resolved[idx];
        return match ? { ...item, productId: String(match.id) } : item;
      }),
    );
    setItemModes((prev) =>
      prev.map((mode, idx) => (resolved[idx] ? "existing" : mode)),
    );
     
    setPendingRefreshNames((prev) =>
      prev.map((name, idx) => (resolved[idx] ? null : name)),
    );
  }, [allProducts, pendingRefreshNames]);
  // ── Server action wiring ───────────────────────────────────────────────────────
  const approveWithItems = async (prev: unknown, formData: FormData) => {
    const itemsData = linkedItems.map((item) => ({
      productId: item.productId,
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      taxPercent: String(item.taxPercent),
    }));
    formData.set("items", JSON.stringify(itemsData));
    return approveOcrInvoice(prev, formData);
  };

  const [approveState, approveAction, approving] = useActionState(approveWithItems, null);
  const [dismissState, dismissAction, dismissing] = useActionState(dismissAgentTask, null);

  // ── Total preview ──────────────────────────────────────────────────────────────
  const discount = parseFloat(discountAmount) || 0;
  let previewSubtotal = 0;
  let previewTax = 0;
  for (const item of linkedItems) {
    const sub = round2(item.quantity * item.unitPrice);
    previewSubtotal = round2(previewSubtotal + sub);
    previewTax = round2(previewTax + round2(sub * (item.taxPercent / 100)));
  }
  const previewTotal = Math.max(0, round2(previewSubtotal + previewTax - discount));

  // ── Helpers ────────────────────────────────────────────────────────────────────
  function updateItem(idx: number, patch: Partial<LinkedItem>) {
    setLinkedItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function updateItemMode(idx: number, mode: "existing" | "create") {
    setItemModes((prev) => prev.map((m, i) => (i === idx ? mode : m)));
  }

  function updateNewProduct(idx: number, patch: Partial<typeof newProducts[0]>) {
    setNewProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  async function handleCreateSupplier() {
    setSupplierError(null);
    const fd = new FormData();
    fd.set("name", newSupplier.name.trim());
    fd.set("type", "supplier");
    fd.set("gstNumber", newSupplier.gstNumber.trim());
    fd.set("phone", newSupplier.phone.trim());
    fd.set("email", newSupplier.email.trim());
    // Set all remaining optional fields to "" so Zod receives "" not null
    fd.set("contactPerson", "");
    fd.set("address", "");
    fd.set("city", "");
    fd.set("state", "");
    fd.set("pincode", "");
    fd.set("notes", "");

    startCreatingSupplier(async () => {
      const result = await createCompany(undefined, fd);
      if (result && "error" in result) {
        const fieldMsgs = result.fieldErrors
          ? Object.values(result.fieldErrors).flat().join(", ")
          : null;
        setSupplierError(fieldMsgs ?? result.error ?? "Failed to create supplier.");
      } else {
        // Store name so useEffect can auto-select after refresh
        setPendingNewSupplierName(newSupplier.name.trim());
        router.refresh();
      }
    });
  }

  async function handleCreateProduct(idx: number) {
    const itemErrors_ = [...itemErrors];
    itemErrors_[idx] = null;
    setItemErrors(itemErrors_);
    setCreatingItemIdx(idx);

    const p = newProducts[idx];
    const fd = new FormData();
    fd.set("name", p.name.trim());
    fd.set("sku", p.sku.trim());
    fd.set("unit", p.unit.trim() || "pcs");
    fd.set("purchasePrice", p.purchasePrice);
    fd.set("reorderLevel", "0");
    // Set remaining optional fields to "" so Zod receives "" not null
    fd.set("description", "");
    fd.set("category", "");
    fd.set("sellingPrice", "");

    const result = await createProduct(undefined, fd);
    setCreatingItemIdx(null);

    if (result && "error" in result) {
      const errs = [...itemErrors];
      const fieldMsgs = result.fieldErrors
        ? Object.values(result.fieldErrors).flat().join(", ")
        : null;
      const msg = fieldMsgs ?? result.error ?? "Failed to create product.";
      // Check if server returned the existing conflicting product
      const ep = result.existingProduct;
      if (ep) {
        const extraProd: ProductOption = {
          id: ep.id,
          name: ep.name,
          sku: ep.sku,
          unit: ep.unit,
          purchasePrice: ep.purchasePrice ? String(ep.purchasePrice) : "0",
        };
        setExtraProducts((prev) => [...prev, extraProd]);
        updateItem(idx, { productId: String(ep.id) });
        updateItemMode(idx, "existing");
        errs[idx] = `SKU "${p.sku.trim()}" already exists and was auto-linked.`;
      } else {
        const isDuplicate = msg.toLowerCase().includes("sku") || msg.toLowerCase().includes("already exists") || msg.toLowerCase().includes("failed to create");
        if (isDuplicate && p.sku.trim()) {
          const skuToFind = p.sku.trim().toLowerCase();
          const existingProduct = allProducts.find((prod) => prod.sku?.toLowerCase() === skuToFind);
          if (existingProduct) {
            updateItem(idx, { productId: String(existingProduct.id) });
            updateItemMode(idx, "existing");
            errs[idx] = `SKU "${p.sku.trim()}" already exists and was auto-linked.`;
          } else {
            errs[idx] = `SKU "${p.sku.trim()}" already exists — switch to "Link" to find it.`;
            updateItemMode(idx, "existing");
          }
        } else {
          errs[idx] = msg;
        }
      }
      setItemErrors(errs);
    } else {
      setPendingRefreshNames((prev) => {
        const next = [...prev];
        next[idx] = p.name.trim();
        return next;
      });
      router.refresh();
    }
  }

  // ── Gate checks ────────────────────────────────────────────────────────────────
  const step1Valid = selectedSupplierId !== "";
  const step2Valid = linkedItems.every((item) => item.productId !== "");
  const step3Valid = invoiceNumber.trim() !== "" && invoiceDate.trim() !== "";

  // ── Dismiss form (always available) ────────────────────────────────────────────
  const dismissForm = (
    <form action={dismissAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={approving || dismissing}
        className="text-muted-foreground hover:text-foreground"
      >
        <XCircle className="h-4 w-4 mr-1" />
        {dismissing ? "Dismissing…" : "Dismiss"}
      </Button>
    </form>
  );

  // ── Gate screen — shown immediately when a duplicate is detected ───────────────
  // User must explicitly choose to dismiss or overwrite before seeing the steps.
  if (duplicateInfo && !proceedWithOverwrite) {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Bot className="h-5 w-5 text-blue-600 shrink-0" />
              <CardTitle className="text-base">AI Invoice Extraction</CardTitle>
              <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-100">
                Pending Review
              </Badge>
            </div>
            {createdAt && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(createdAt).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 italic">
            AI extracted: &ldquo;{plan.supplierName}&rdquo;
            {plan.supplierGstNumber && ` · GST: ${plan.supplierGstNumber}`}
          </p>
        </CardHeader>

        <CardContent className="pb-5">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-900">This bill is already saved</p>
                <p className="text-sm text-amber-800">
                  Invoice <span className="font-mono font-medium">#{plan.invoiceNumber}</span> from this
                  supplier already exists in your records
                  {duplicateInfo.invoiceDate && ` (dated ${duplicateInfo.invoiceDate})`}
                  {duplicateInfo.totalAmount &&
                    `, ₹${parseFloat(duplicateInfo.totalAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}.
                </p>
                <p className="text-sm text-amber-700 pt-0.5">What would you like to do?</p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <form action={dismissAction}>
                <input type="hidden" name="taskId" value={taskId} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={dismissing}
                  className="border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  {dismissing ? "Dismissing…" : "Dismiss, Keep Existing"}
                </Button>
              </form>
              <Button
                type="button"
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => setProceedWithOverwrite(true)}
              >
                Review & Overwrite
              </Button>
            </div>

            {dismissState && "error" in dismissState && (
              <p className="text-xs text-destructive">{dismissState.error}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      {/* ── Card header ─────────────────────────────────────────────────────────── */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Bot className="h-5 w-5 text-blue-600 shrink-0" />
            <CardTitle className="text-base">AI Invoice Extraction</CardTitle>
            <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-100">
              Pending Review
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {createdAt && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(createdAt).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            {dismissForm}
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-1 italic">
          AI extracted: &ldquo;{plan.supplierName}&rdquo;
          {plan.supplierGstNumber && ` · GST: ${plan.supplierGstNumber}`}
        </p>

        {/* Progress indicator */}
        <div className="mt-3">
          <StepIndicator current={step} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pb-5">

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* STEP 1 — SUPPLIER                                                     */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Select or create a supplier</h3>
              {/* Mode toggle */}
              <div className="flex rounded-md border overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setSupplierMode("existing")}
                  className={cn(
                    "px-3 py-1.5 font-medium transition-colors",
                    supplierMode === "existing"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  Select Existing
                </button>
                <button
                  type="button"
                  onClick={() => setSupplierMode("create")}
                  className={cn(
                    "px-3 py-1.5 font-medium transition-colors border-l",
                    supplierMode === "create"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  Create New
                </button>
              </div>
            </div>

            {supplierMode === "existing" ? (
              <div className="space-y-1.5">
                <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select supplier…" />
                  </SelectTrigger>
                  <SelectContent>
                    {initialSuppliers.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                        {s.gstNumber && (
                          <span className="ml-2 text-xs text-muted-foreground">{s.gstNumber}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedSupplierId && (
                  <p className="text-xs text-amber-600">
                    No match found automatically. Select manually or create a new supplier.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-md border bg-white p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Company Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={newSupplier.name}
                    onChange={(e) => setNewSupplier((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Acme Supplies Pvt Ltd"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">GST Number</Label>
                    <Input
                      value={newSupplier.gstNumber}
                      onChange={(e) => setNewSupplier((p) => ({ ...p, gstNumber: e.target.value }))}
                      placeholder="27AABCU9603R1ZX"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Phone</Label>
                    <Input
                      value={newSupplier.phone}
                      onChange={(e) => setNewSupplier((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Email</Label>
                  <Input
                    type="email"
                    value={newSupplier.email}
                    onChange={(e) => setNewSupplier((p) => ({ ...p, email: e.target.value }))}
                    placeholder="supplier@example.com"
                  />
                </div>
                {supplierError && (
                  <p className="text-xs text-destructive">{supplierError}</p>
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={!newSupplier.name.trim() || creatingSupplier}
                  onClick={handleCreateSupplier}
                  className="w-full"
                >
                  {creatingSupplier && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {creatingSupplier ? "Saving Supplier…" : "Save Supplier"}
                </Button>
                {pendingNewSupplierName && (
                  <p className="text-xs text-blue-700 text-center">
                    Supplier saved — refreshing…
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                size="sm"
                disabled={!step1Valid}
                onClick={() => setStep(2)}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* STEP 2 — LINE ITEMS                                                   */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Link or create products</h3>
              <span className="text-xs text-muted-foreground">
                {linkedItems.filter((i) => i.productId !== "").length}/{linkedItems.length} linked
              </span>
            </div>

            <div className="space-y-3">
              {linkedItems.map((item, idx) => (
                <div key={idx} className="rounded-md border bg-white p-3 space-y-3">
                  {/* Row header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.productId ? (
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">{item.description}</span>
                    </div>
                    {/* Mode toggle per row */}
                    <div className="flex rounded-md border overflow-hidden text-[11px] shrink-0">
                      <button
                        type="button"
                        onClick={() => updateItemMode(idx, "existing")}
                        className={cn(
                          "px-2 py-1 font-medium transition-colors",
                          itemModes[idx] === "existing"
                            ? "bg-blue-600 text-white"
                            : "bg-white text-muted-foreground hover:bg-muted/50",
                        )}
                      >
                        Link
                      </button>
                      <button
                        type="button"
                        onClick={() => updateItemMode(idx, "create")}
                        className={cn(
                          "px-2 py-1 font-medium transition-colors border-l",
                          itemModes[idx] === "create"
                            ? "bg-blue-600 text-white"
                            : "bg-white text-muted-foreground hover:bg-muted/50",
                        )}
                      >
                        Create
                      </button>
                    </div>
                  </div>

                  {/* Per-row error shown in both modes */}
                  {itemErrors[idx] && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      {itemErrors[idx]}
                    </p>
                  )}

                  {itemModes[idx] === "existing" ? (
                    <Select
                      value={item.productId}
                      onValueChange={(v) => {
                        updateItem(idx, { productId: v });
                        // Clear error once user picks a product
                        if (itemErrors[idx]) {
                          const errs = [...itemErrors];
                          errs[idx] = null;
                          setItemErrors(errs);
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm w-full">
                        <SelectValue placeholder="Link to product in catalog…" />
                      </SelectTrigger>
                      <SelectContent>
                        {allProducts.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                            {p.sku && (
                              <span className="ml-2 font-mono text-xs text-muted-foreground">
                                {p.sku}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1 col-span-2">
                          <Label className="text-xs text-muted-foreground">
                            Product Name <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            className="h-8 text-sm"
                            value={newProducts[idx].name}
                            onChange={(e) => updateNewProduct(idx, { name: e.target.value })}
                            placeholder="Product name"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">SKU / Part No.</Label>
                          <Input
                            className="h-8 text-sm"
                            value={newProducts[idx].sku}
                            onChange={(e) => updateNewProduct(idx, { sku: e.target.value })}
                            placeholder="SKU-001"
                          />
                          {plan.items[idx]?.hsnCode && (
                            <p className="text-xs text-muted-foreground">
                              HSN/SAC: <span className="font-mono">{plan.items[idx].hsnCode}</span>
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Unit</Label>
                          <Input
                            className="h-8 text-sm"
                            value={newProducts[idx].unit}
                            onChange={(e) => updateNewProduct(idx, { unit: e.target.value })}
                            placeholder="pcs"
                          />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <Label className="text-xs text-muted-foreground">Purchase Price (₹)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 text-sm"
                            value={newProducts[idx].purchasePrice}
                            onChange={(e) => updateNewProduct(idx, { purchasePrice: e.target.value })}
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        disabled={!newProducts[idx].name.trim() || creatingItemIdx === idx}
                        onClick={() => handleCreateProduct(idx)}
                      >
                        {creatingItemIdx === idx && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {creatingItemIdx === idx ? "Saving Product…" : "Save Product"}
                      </Button>
                      {pendingRefreshNames[idx] && (
                        <p className="text-xs text-blue-700 text-center">Product saved — refreshing…</p>
                      )}
                    </div>
                  )}

                  {/* Editable qty / price / tax */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Qty</Label>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        className="h-7 text-sm"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Unit Price (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-7 text-sm"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Tax %</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        className="h-7 text-sm"
                        value={item.taxPercent}
                        onChange={(e) => updateItem(idx, { taxPercent: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button type="button" size="sm" disabled={!step2Valid} onClick={() => setStep(3)}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* STEP 3 — INVOICE DETAILS                                              */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Confirm invoice details</h3>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-sm font-medium">
                  Invoice No. <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => { setInvoiceNumber(e.target.value); setOverwriteDismissed(false); setProceedWithOverwrite(false); }}
                  placeholder="INV-001"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Invoice Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Due Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Discount (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this invoice…"
              />
            </div>

            {/* Live total preview */}
            <div className="rounded-md border bg-white px-4 py-2 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">
                Subtotal ₹{previewSubtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                {" + "}Tax ₹{previewTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                {discount > 0 && ` − Discount ₹${discount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
              </span>
              <span className="font-semibold">
                Total: ₹{previewTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Approve form */}
            <form ref={approveFormRef} action={approveAction} className="space-y-3">
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="companyId" value={selectedSupplierId} />
              <input type="hidden" name="invoiceNumber" value={invoiceNumber} />
              <input type="hidden" name="invoiceDate" value={invoiceDate} />
              <input type="hidden" name="dueDate" value={dueDate} />
              <input type="hidden" name="discountAmount" value={discountAmount} />
              <input type="hidden" name="notes" value={notes} />
              <input type="hidden" name="overwrite" ref={overwriteRef} defaultValue={proceedWithOverwrite ? "true" : "false"} />

              {/* Duplicate warning — shown when server detects an existing bill */}
              {approveState && "duplicate" in approveState && !overwriteDismissed && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-semibold">Duplicate bill detected</p>
                      <p className="text-xs mt-0.5">
                        Invoice <span className="font-mono font-medium">#{invoiceNumber}</span> already exists for this supplier
                        {approveState.existingInvoiceDate && ` (dated ${approveState.existingInvoiceDate})`}
                        {approveState.existingTotal && `, ₹${parseFloat(approveState.existingTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}.
                      </p>
                      <p className="text-xs mt-1">
                        Overwriting will replace all line items and reverse + reapply stock accordingly.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setOverwriteDismissed(true)}
                    >
                      No, Keep Existing
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => {
                        if (overwriteRef.current) overwriteRef.current.value = "true";
                        approveFormRef.current?.requestSubmit();
                      }}
                    >
                      Yes, Overwrite Bill
                    </Button>
                  </div>
                </div>
              )}

              {approveState && "error" in approveState && (
                <p className="text-sm text-destructive">{approveState.error}</p>
              )}
              {approveState && "success" in approveState && (
                <p className="text-sm text-green-700">
                  Purchase bill {(approveState as { invoiceNumber: string }).invoiceNumber} created successfully.
                </p>
              )}
              {dismissState && "error" in dismissState && (
                <p className="text-sm text-destructive">{dismissState.error}</p>
              )}

              <div className="flex justify-between pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setStep(2)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!step3Valid || approving || dismissing}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {approving ? "Saving bill…" : "Create Purchase Bill"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
