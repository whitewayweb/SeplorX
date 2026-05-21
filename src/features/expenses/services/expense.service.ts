import { db } from "@/db";
import { expenses, expenseCategories, agentActions, salesOrderItems, salesOrders } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { type InsertExpenseParams, insertExpenseSchema } from "@/lib/validations/expenses";

export async function getExpenses() {
  return db
    .select({
      expense: expenses,
      categoryName: expenseCategories.name,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .orderBy(desc(expenses.date));
}


/**
 * Resolves an OCR agent action draft and creates a finalized expense record.
 */
export async function resolveExpenseOcrTask(
  taskId: number,
  userId: number,
  data: InsertExpenseParams
) {
  const parsedData = insertExpenseSchema.parse(data);

  return await db.transaction(async (tx) => {
    // 1. Mark the agent action as executed
    const [action] = await tx
      .update(agentActions)
      .set({
        status: "executed",
        resolvedAt: new Date(),
        resolvedBy: userId,
      })
      .where(
        and(
          eq(agentActions.id, taskId),
          eq(agentActions.status, "pending_approval")
        )
      )
      .returning();

    if (!action) {
      throw new Error("Task not found or already resolved.");
    }

    // 2. Insert the actual expense
    const [newExpense] = await tx
      .insert(expenses)
      .values({
        categoryId: parsedData.categoryId ?? null,
        amount: parsedData.amount.toString(),
        taxAmount: parsedData.taxAmount.toString(),
        currency: parsedData.currency,
        date: parsedData.date,
        name: parsedData.name,
        description: parsedData.description ?? null,
        paymentMode: parsedData.paymentMode,
        reference: parsedData.reference ?? null,
        isBillable: parsedData.isBillable,
        salesOrderId: parsedData.isBillable ? parsedData.salesOrderId : null,
        createdBy: userId,
      })
      .returning();

    return newExpense;
  });
}

