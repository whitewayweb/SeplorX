"use client";

import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExpenseSchema, type InsertExpenseParams } from "@/lib/validations/expenses";
import { updateExpenseAction, deleteExpenseAction } from "@/app/(dashboard)/expenses/actions";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Edit2, FileText, IndianRupee, Banknote, Trash2 } from "lucide-react";

type ExpenseData = {
  id: number;
  amount: string | number;
  currency: string;
  name: string | null;
  description: string | null;
  date: string;
  reference: string | null;
  paymentMode: string;
  taxAmount: string | number;
  isBillable: boolean;
  salesOrderId: number | null;
  isInvoiced: boolean;
};

export function ExpenseTableClient({
  expensesList,
  suppliers = [],
  uniqueCategories = []
}: {
  expensesList: Array<{ expense: ExpenseData, categoryName: string | null, companyName: string | null }>;
  suppliers?: { id: number, name: string }[];
  uniqueCategories?: string[];
}) {
  const [selectedExpense, setSelectedExpense] = useState<{ expense: ExpenseData, categoryName: string | null, companyName: string | null } | null>(null);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-12">
              <input type="checkbox" className="rounded border-gray-300" />
            </TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Vendor / Name</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Reference #</TableHead>
            <TableHead>Payment Mode</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expensesList.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No expenses found.
              </TableCell>
            </TableRow>
          ) : (
            expensesList.map(({ expense, categoryName, companyName }) => (
              <TableRow
                key={expense.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedExpense({ expense, categoryName, companyName })}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="rounded border-gray-300" />
                </TableCell>
                <TableCell className="font-medium text-sm">
                  {categoryName || "Uncategorized"}
                </TableCell>
                <TableCell>
                  {formatCurrency(Number(expense.amount), expense.currency)}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-sm">{companyName || expense.name || "Unknown"}</div>
                  {expense.description && (
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">{expense.description}</div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{expense.date}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{expense.reference || "-"}</TableCell>
                <TableCell>
                  <span className="capitalize text-sm">{expense.paymentMode.replace("_", " ")}</span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Sheet open={!!selectedExpense} onOpenChange={(open) => !open && setSelectedExpense(null)}>
        <SheetContent className="md:max-w-3xl overflow-y-auto w-full px-4 gap-2">
          <SheetHeader className="mb-4 border-b pb-4">
            <SheetTitle className="flex items-center text-xl">
              <Edit2 className="w-5 h-5 text-amber-500" />
              Edit Expense
            </SheetTitle>
            <p className="text-sm text-muted-foreground">Update the details of this expense below.</p>
          </SheetHeader>

          {selectedExpense && (
            <ExpenseEditForm
              initialData={selectedExpense}
              onClose={() => setSelectedExpense(null)}
              suppliers={suppliers}
              uniqueCategories={uniqueCategories}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function ExpenseEditForm({
  initialData,
  onClose,
  suppliers,
  uniqueCategories
}: {
  initialData: { expense: ExpenseData, categoryName: string | null, companyName: string | null };
  onClose: () => void;
  suppliers: { id: number, name: string }[];
  uniqueCategories: string[];
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { expense, categoryName, companyName } = initialData;

  const form = useForm<InsertExpenseParams>({
    resolver: zodResolver(insertExpenseSchema),
    defaultValues: {
      amount: Number(expense.amount),
      taxAmount: Number(expense.taxAmount),
      currency: expense.currency,
      date: expense.date,
      name: companyName || expense.name || "",
      categoryName: categoryName || "",
      description: expense.description || "",
      paymentMode: expense.paymentMode as InsertExpenseParams["paymentMode"],
      reference: expense.reference || "",
      isBillable: expense.isBillable,
      salesOrderId: expense.salesOrderId || undefined,
    },
  });

  // reset form when initialData changes
  useEffect(() => {
    form.reset({
      amount: Number(expense.amount),
      taxAmount: Number(expense.taxAmount),
      currency: expense.currency,
      date: expense.date,
      name: companyName || expense.name || "",
      categoryName: categoryName || "",
      description: expense.description || "",
      paymentMode: expense.paymentMode as InsertExpenseParams["paymentMode"],
      reference: expense.reference || "",
      isBillable: expense.isBillable,
      salesOrderId: expense.salesOrderId || undefined,
    });
  }, [expense, categoryName, companyName, form]);

  const onSubmit = async (data: InsertExpenseParams) => {
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("id", expense.id.toString());
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

      const result = await updateExpenseAction(null, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Expense updated successfully.");
      onClose();
    } catch {
      toast.error("Failed to update expense.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;
    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append("id", expense.id.toString());
      const result = await deleteExpenseAction(null, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Expense deleted successfully.");
      onClose();
    } catch {
      toast.error("Failed to delete expense.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pb-6">

        <datalist id="vendors-list">
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.name} />
          ))}
        </datalist>

        <datalist id="categories-list">
          {uniqueCategories.map((category, idx) => (
            <option key={idx} value={category} />
          ))}
        </datalist>

        <div className="bg-muted/30 p-4 rounded-xl border border-muted flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 text-amber-600 rounded-full">
              <IndianRupee className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Amount</p>
              <h2 className="text-2xl font-bold tracking-tight">
                {form.watch("currency")} {form.watch("amount")}
              </h2>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase text-muted-foreground font-semibold">Vendor / Name</FormLabel>
                <FormControl><Input className="bg-muted/20" list="vendors-list" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase text-muted-foreground font-semibold">Date</FormLabel>
                <FormControl><Input className="bg-muted/20" type="date" {...field} /></FormControl>
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
              <FormLabel className="text-xs uppercase text-muted-foreground font-semibold">Category</FormLabel>
              <FormControl><Input className="bg-muted/20" list="categories-list" {...field} placeholder="e.g. Travel, Office Supplies" value={field.value || ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-muted/20 p-4 rounded-lg border">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase text-muted-foreground font-semibold">Total Amount</FormLabel>
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
                <FormLabel className="text-xs uppercase text-muted-foreground font-semibold">Tax Amount</FormLabel>
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
                <FormLabel className="text-xs uppercase text-muted-foreground font-semibold">Currency</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="paymentMode"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase text-muted-foreground font-semibold">Payment Mode</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-muted/20 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="reference"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase text-muted-foreground font-semibold">Reference #</FormLabel>
                <FormControl><Input className="bg-muted/20" {...field} value={field.value || ""} /></FormControl>
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
              <FormLabel className="text-xs uppercase text-muted-foreground font-semibold flex items-center gap-2"><FileText className="w-3 h-3" /> Description</FormLabel>
              <FormControl><Input className="bg-muted/20" {...field} value={field.value || ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="border-t pt-4 space-y-4">
          <FormField
            control={form.control}
            name="isBillable"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-xl border p-4 shadow-sm bg-gradient-to-br from-background to-muted/20">
                <div className="space-y-1">
                  <FormLabel className="text-sm font-semibold flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-emerald-500" />
                    Billable Expense
                  </FormLabel>
                  <FormDescription className="text-xs">
                    Can this expense be billed back to a customer?
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {form.watch("isBillable") && (
            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
              <FormField
                control={form.control}
                name="salesOrderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase text-emerald-700 dark:text-emerald-400 font-semibold">Sales Order ID (to bill against)</FormLabel>
                    <FormControl>
                      <Input className="bg-background/50 border-emerald-200 dark:border-emerald-800" type="number" {...field} value={field.value || ""} onChange={e => field.onChange(parseInt(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t mt-4">
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isSaving || isDeleting}>
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete
          </Button>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving || isDeleting}>Cancel</Button>
            <Button type="submit" disabled={isSaving || isDeleting} className="bg-amber-600 hover:bg-amber-700 text-white min-w-[120px]">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
