"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExpenseSchema, type InsertExpenseParams } from "@/lib/validations/expenses";
import { normalizeDropzoneFile, defaultDocumentDropzoneValidation } from "@/lib/dropzone";
import { processExpenseReceiptAction, executeExpenseDraftAction } from "@/app/(dashboard)/expenses/actions";
import { toast } from "sonner";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useDropzone } from "@/components/ui/dropzone";
import { FileUploadDropzone } from "@/components/molecules/file-upload-dropzone";
import { DOCUMENT_UPLOAD_ACCEPT, DOCUMENT_UPLOAD_MAX_SIZE } from "@/lib/file-upload";

interface PendingTask {
  id: number;
  plan: Record<string, unknown> | null;
}

export function ExpenseUploader({ pendingTask }: { pendingTask?: PendingTask | null }) {
  const [isUploading, setIsUploading] = useState(false);
  const [task, setTask] = useState<PendingTask | null>(pendingTask || null);

  const dropzone = useDropzone<null, string>({
    onDropFile: async (incomingFile) => {
      setIsUploading(true);
      try {
        // Eagerly normalize the file into memory to strip native filesystem handle bindings
        const memoryFile = await normalizeDropzoneFile(incomingFile);

        const formData = new FormData();
        formData.append("receipt", memoryFile);

        const result = await processExpenseReceiptAction(null, formData);
        if (result.error) {
          toast.error(result.error);
          return { status: "error", error: result.error };
        }

        toast.success("Receipt processed successfully!");
        window.location.reload();
        return { status: "success", result: null };
      } catch {
        toast.error("An unexpected error occurred.");
        return { status: "error", error: "An unexpected error occurred." };
      } finally {
        setIsUploading(false);
      }
    },
    validation: defaultDocumentDropzoneValidation,
    maxRetryCount: 2,
    shiftOnMaxFiles: true,
  });

  return (
    <div className="space-y-6">
      {!task ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium leading-none tracking-tight">Upload Receipt</h3>
            <p className="text-sm text-muted-foreground mt-1.5">Upload a receipt or invoice to automatically extract the expense details.</p>
          </div>
          <FileUploadDropzone
            dropzone={dropzone}
            showRetry
            title={isUploading ? "Uploading receipt..." : "Drop your receipt here, or browse"}
          />
        </div>
      ) : (
        <ExpenseReviewForm task={task} onClear={() => setTask(null)} />
      )}
    </div>
  );
}

function ExpenseReviewForm({ task, onClear }: { task: PendingTask; onClear: () => void }) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<InsertExpenseParams>({
    resolver: zodResolver(insertExpenseSchema),
    defaultValues: {
      amount: task.plan?.amount ? Number(task.plan.amount) : 0,
      taxAmount: task.plan?.taxAmount ? Number(task.plan.taxAmount) : 0,
      currency: task.plan?.currency ? String(task.plan.currency) : "INR",
      date: task.plan?.date ? String(task.plan.date) : new Date().toISOString().split("T")[0],
      name: task.plan?.vendorName ? String(task.plan.vendorName) : "",
      categoryName: task.plan?.categoryName ? String(task.plan.categoryName) : "",
      description: task.plan?.description ? String(task.plan.description) : "",
      paymentMode: "bank_transfer",
      reference: task.plan?.reference ? String(task.plan.reference) : "",
      isBillable: false,
      salesOrderId: undefined,
    },
  });

  const onSubmit = async (data: InsertExpenseParams) => {
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("taskId", task.id.toString());
      formData.append("amount", data.amount.toString());
      formData.append("taxAmount", (data.taxAmount ?? 0).toString());
      formData.append("currency", data.currency ?? "INR");
      formData.append("date", data.date);
      if (data.name) formData.append("name", data.name);
      if (data.categoryName) formData.append("categoryName", data.categoryName);
      if (data.description) formData.append("description", data.description);
      formData.append("paymentMode", data.paymentMode ?? "bank_transfer");
      if (data.reference) formData.append("reference", data.reference);
      formData.append("isBillable", data.isBillable ? "true" : "false");
      if (data.salesOrderId) {
        formData.append("salesOrderId", data.salesOrderId.toString());
      }

      const result = await executeExpenseDraftAction(null, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Expense saved successfully.");
      onClear();
      window.location.reload();
    } catch {
      toast.error("Failed to save expense.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-medium leading-none tracking-tight">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          Review Extracted Expense
        </h3>
        <p className="text-sm text-muted-foreground mt-1.5">The AI has extracted the following details. Please review and save.</p>
      </div>
      <div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="categoryName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Travel, Office Supplies" value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="taxAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isBillable"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Billable Expense</FormLabel>
                    <FormDescription>
                      Can this expense be billed back to a customer?
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {form.watch("isBillable") && (
              <FormField
                control={form.control}
                name="salesOrderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sales Order ID (to bill against)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} value={field.value || ""} onChange={e => field.onChange(parseInt(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClear} disabled={isSaving}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save to Ledger
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
