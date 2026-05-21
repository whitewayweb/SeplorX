import { getAuthenticatedUserId } from "@/lib/auth";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { getExpenses } from "@/services/expense.service";
import { ExpenseUploader } from "@/features/expenses/components/expense";
import { db } from "@/db";
import { agentActions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  await getAuthenticatedUserId();

  // Fetch pending OCR tasks for this feature
  const pendingTasks = await db
    .select()
    .from(agentActions)
    .where(
      and(
        eq(agentActions.agentType, "expense_ocr"),
        eq(agentActions.status, "pending_approval")
      )
    )
    .limit(1);

  const pendingTask = pendingTasks.length > 0 ? pendingTasks[0] : null;

  // Fetch finalized expenses
  const expensesList = await getExpenses();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Expenses & COGS"
        description="Track operational costs and billable expenses with AI receipt extraction."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <ExpenseUploader pendingTask={pendingTask ? { ...pendingTask, plan: pendingTask.plan as Record<string, unknown> | null } : null} />
        </div>

        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expensesList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No expenses found. Upload a receipt to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    expensesList.map(({ expense, categoryName }) => (
                      <TableRow key={expense.id}>
                        <TableCell>{expense.date}</TableCell>
                        <TableCell>
                          <div className="font-medium">{expense.name}</div>
                          <div className="text-xs text-muted-foreground">{expense.description}</div>
                        </TableCell>
                        <TableCell>{categoryName || "Uncategorized"}</TableCell>
                        <TableCell className="text-right">
                          {expense.currency} {Number(expense.amount).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {expense.isBillable ? (
                            <Badge variant={expense.isInvoiced ? "default" : "secondary"}>
                              {expense.isInvoiced ? "Billed" : "Billable"}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Operational</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
