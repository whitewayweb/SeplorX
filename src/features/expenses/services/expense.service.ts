import { db } from "@/db";
import { expenses, expenseCategories, agentActions, companies } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { type InsertExpenseParams, insertExpenseSchema } from "@/lib/validations/expenses";

export async function getExpenses() {
  return db
    .select({
      expense: expenses,
      categoryName: expenseCategories.name,
      companyName: companies.name,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .leftJoin(companies, eq(expenses.companyId, companies.id))
    .orderBy(desc(expenses.date));
}

export async function getSupplierCompanies() {
  return db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.type, "supplier"))
    .orderBy(companies.name);
}

export async function getExpenseCategories() {
  const result = await db.select({ name: expenseCategories.name }).from(expenseCategories);
  return result.map(r => r.name).filter(Boolean);
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

    let resolvedCompanyId = parsedData.companyId || null;
    if (!resolvedCompanyId && parsedData.name) {
      const [existingCompany] = await tx
        .select()
        .from(companies)
        .where(eq(companies.name, parsedData.name));
      if (existingCompany) {
        resolvedCompanyId = existingCompany.id;
      } else {
        const [newCompany] = await tx
          .insert(companies)
          .values({ name: parsedData.name, type: "supplier", userId })
          .returning();
        resolvedCompanyId = newCompany.id;
      }
    }

    let categoryId = null;
    if (parsedData.categoryName) {
      const [existingCategory] = await tx
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.name, parsedData.categoryName));

      if (existingCategory) {
        categoryId = existingCategory.id;
      } else {
        const [newCat] = await tx
          .insert(expenseCategories)
          .values({ name: parsedData.categoryName })
          .returning();
        categoryId = newCat.id;
      }
    }

    // 2. Insert the actual expense
    const [newExpense] = await tx
      .insert(expenses)
      .values({
        categoryId,
        companyId: resolvedCompanyId,
        amount: parsedData.amount.toString(),
        taxAmount: parsedData.taxAmount.toString(),
        currency: parsedData.currency,
        date: parsedData.date,
        name: parsedData.name || null,
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

export async function updateExpense(
  id: number,
  data: InsertExpenseParams
) {
  const parsedData = insertExpenseSchema.parse(data);

  return await db.transaction(async (tx) => {
    let resolvedCompanyId = parsedData.companyId || null;
    if (!resolvedCompanyId && parsedData.name) {
      const [existingCompany] = await tx
        .select()
        .from(companies)
        .where(eq(companies.name, parsedData.name));
      if (existingCompany) {
        resolvedCompanyId = existingCompany.id;
      } else {
        const [newCompany] = await tx
          .insert(companies)
          .values({ name: parsedData.name, type: "supplier" })
          .returning();
        resolvedCompanyId = newCompany.id;
      }
    }

    let categoryId = null;
    if (parsedData.categoryName) {
      const [existingCategory] = await tx
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.name, parsedData.categoryName));

      if (existingCategory) {
        categoryId = existingCategory.id;
      } else {
        const [newCat] = await tx
          .insert(expenseCategories)
          .values({ name: parsedData.categoryName })
          .returning();
        categoryId = newCat.id;
      }
    }

    const [updatedExpense] = await tx
      .update(expenses)
      .set({
        categoryId,
        companyId: resolvedCompanyId,
        amount: parsedData.amount.toString(),
        taxAmount: parsedData.taxAmount.toString(),
        currency: parsedData.currency,
        date: parsedData.date,
        name: parsedData.name || null,
        description: parsedData.description ?? null,
        paymentMode: parsedData.paymentMode,
        reference: parsedData.reference ?? null,
        isBillable: parsedData.isBillable,
        salesOrderId: parsedData.isBillable ? parsedData.salesOrderId : null,
      })
      .where(eq(expenses.id, id))
      .returning();

    return updatedExpense;
  });
}

export async function deleteExpense(id: number) {
  return await db.delete(expenses).where(eq(expenses.id, id));
}
