import { getAuthenticatedUserId } from "@/lib/auth";
import { getExpenses, getSupplierCompanies, getExpenseCategories } from "@/features/expenses/services/expense.service";
import { ExpenseUploader } from "@/features/expenses/components/expense";
import { db } from "@/db";
import { agentActions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ExpenseTableClient } from "@/features/expenses/components/expense-table-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Filter, RefreshCw, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  await getAuthenticatedUserId();

  const [pendingTasks, expensesList, suppliers, uniqueCategories] = await Promise.all([
    db
      .select()
      .from(agentActions)
      .where(
        and(
          eq(agentActions.agentType, "expense_ocr"),
          eq(agentActions.status, "pending_approval")
        )
      )
      .limit(1),
    getExpenses(),
    getSupplierCompanies(),
    getExpenseCategories()
  ]);

  const pendingTask = pendingTasks.length > 0 ? pendingTasks[0] : null;

  // Metrics calculation
  const total = expensesList.reduce((sum, item) => sum + Number(item.expense.amount), 0);
  const billable = expensesList.filter(item => item.expense.isBillable).reduce((sum, item) => sum + Number(item.expense.amount), 0);
  const nonBillable = expensesList.filter(item => !item.expense.isBillable).reduce((sum, item) => sum + Number(item.expense.amount), 0);
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="p-6 space-y-6 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-sm font-medium text-amber-500">Total Expenses</span>
            <span className="text-xl font-bold">{formatCurrency(total)}</span>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-sm font-medium text-emerald-600">Billable Expenses</span>
            <span className="text-xl font-bold">{formatCurrency(billable)}</span>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-sm font-medium text-amber-600">Non Billable Expenses</span>
            <span className="text-xl font-bold">{formatCurrency(nonBillable)}</span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-4 items-center">
        <div className="flex items-center gap-2">
          <Dialog defaultOpen={!!pendingTask}>
            <DialogTrigger asChild>
              <Button className="bg-[#1e293b] hover:bg-[#0f172a] text-white">
                <Plus className="w-4 h-4 mr-2" /> Record Expense
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Expense</DialogTitle>
              </DialogHeader>
              <ExpenseUploader pendingTask={pendingTask ? { ...pendingTask, plan: pendingTask.plan as Record<string, unknown> | null } : null} />
            </DialogContent>
          </Dialog>
        </div>
        
        <div>
          <Button variant="outline">
            <Filter className="w-4 h-4 mr-2" /> Filters
          </Button>
        </div>
      </div>

      <Card className="shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-b gap-4">
          <div className="flex items-center gap-2">
            <select className="border rounded-md px-3 py-1.5 text-sm bg-background">
              <option>50</option>
            </select>
            <Button variant="outline" size="sm">Export</Button>
            <Button variant="outline" size="sm">Bulk Actions</Button>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search..." className="pl-8 h-9" />
          </div>
        </div>
        <CardContent className="p-0">
          <ExpenseTableClient 
            expensesList={expensesList} 
            suppliers={suppliers}
            uniqueCategories={uniqueCategories}
          />
        </CardContent>
        <div className="p-4 border-t flex justify-between items-center text-sm text-muted-foreground">
          <div>
            Showing 1 to {expensesList.length} of {expensesList.length} entries
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled>Previous</Button>
            <Button variant="secondary" size="sm" className="bg-muted">1</Button>
            <Button variant="ghost" size="sm" disabled>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
