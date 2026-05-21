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

/**
 * Converts a billable expense into a line item on a Sales Order.
 * This mirrors the PMB "convert_to_invoice" functionality.
 */
export async function convertExpenseToOrderLine(expenseId: number) {
  return await db.transaction(async (tx) => {
    const [expense] = await tx.select().from(expenses).where(eq(expenses.id, expenseId));

    if (!expense) throw new Error("Expense not found");
    if (!expense.isBillable) throw new Error("Expense is not marked as billable");
    if (!expense.salesOrderId) throw new Error("Expense is not linked to a Sales Order");
    if (expense.isInvoiced) throw new Error("Expense has already been converted");

    const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, expense.salesOrderId));
    if (!order) throw new Error("Linked Sales Order not found");

    // Create the line item
    const [lineItem] = await tx.insert(salesOrderItems).values({
      orderId: order.id,
      externalItemId: `expense-${expense.id}`,
      title: `Expense Charge: ${expense.name}${expense.description ? ` - ${expense.description}` : ""}`,
      quantity: 1,
      price: expense.amount, // Total amount is billed back
      unitCost: expense.amount,
      costSource: "expense",
      costCapturedAt: new Date(),
      rawData: { expenseId: expense.id },
    }).returning();

    // Mark expense as invoiced
    await tx.update(expenses).set({ isInvoiced: true }).where(eq(expenses.id, expense.id));

    // Update the Sales Order total
    const newTotal = Number(order.totalAmount || 0) + Number(expense.amount);
    await tx.update(salesOrders).set({ totalAmount: newTotal.toString() }).where(eq(salesOrders.id, order.id));

    return lineItem;
  });
}
