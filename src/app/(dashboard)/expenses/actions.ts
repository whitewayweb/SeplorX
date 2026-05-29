"use server";

import { getAuthenticatedUserId } from "@/lib/auth";
import { runExpenseOcrAgent } from "@/lib/agents/expense-ocr-agent";
import { resolveExpenseOcrTask } from "@/features/expenses/services/expense.service";
import { insertExpenseSchema } from "@/lib/validations/expenses";
import { revalidatePath } from "next/cache";

import { documentUploadSchema } from "@/lib/dropzone";

export async function processExpenseReceiptAction(_prevState: unknown, formData: FormData): Promise<{
  success?: boolean;
  taskId?: number;
  error?: string;
}> {
  try {
    await getAuthenticatedUserId();

    const rawFile = formData.get("receipt");
    const parsedFile = documentUploadSchema.safeParse(rawFile);
    
    if (!parsedFile.success) {
      // Return the first validation error message securely
      return { error: parsedFile.error.errors[0].message };
    }

    const file = parsedFile.data;
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type;

    const { taskId } = await runExpenseOcrAgent(buffer, mimeType);

    revalidatePath("/expenses");
    return { success: true, taskId };
  } catch (err) {
    console.error("[processExpenseReceiptAction]", err);
    return { error: "Failed to process receipt. Please try again." };
  }
}

export async function executeExpenseDraftAction(_prevState: unknown, formData: FormData): Promise<{
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}> {
  try {
    const userId = await getAuthenticatedUserId();

    const taskId = Number(formData.get("taskId"));
    const amount = Number(formData.get("amount"));
    const taxAmount = Number(formData.get("taxAmount"));
    const categoryName = formData.get("categoryName") ? String(formData.get("categoryName")) : null;
    const companyId = formData.get("companyId") ? Number(formData.get("companyId")) : null;
    const salesOrderId = formData.get("salesOrderId") ? Number(formData.get("salesOrderId")) : null;
    const isBillable = formData.get("isBillable") === "true";

    const parsed = insertExpenseSchema.safeParse({
      categoryName,
      companyId,
      amount,
      taxAmount,
      currency: formData.get("currency") || "USD",
      date: formData.get("date"),
      name: formData.get("name"),
      description: formData.get("description"),
      paymentMode: formData.get("paymentMode") || "bank_transfer",
      reference: formData.get("reference"),
      isBillable,
      salesOrderId,
    });

    if (!parsed.success) {
      return {
        error: "Validation failed.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    await resolveExpenseOcrTask(taskId, userId, parsed.data);

    revalidatePath("/expenses");
    return { success: true };
  } catch (err) {
    console.error("[executeExpenseDraftAction]", err);
    return { error: err instanceof Error ? err.message : "Failed to save expense." };
  }
}

export async function updateExpenseAction(_prevState: unknown, formData: FormData): Promise<{
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}> {
  try {
    await getAuthenticatedUserId();

    const id = Number(formData.get("id"));
    const amount = Number(formData.get("amount"));
    const taxAmount = Number(formData.get("taxAmount"));
    const categoryName = formData.get("categoryName") ? String(formData.get("categoryName")) : null;
    const companyId = formData.get("companyId") ? Number(formData.get("companyId")) : null;
    const salesOrderId = formData.get("salesOrderId") ? Number(formData.get("salesOrderId")) : null;
    const isBillable = formData.get("isBillable") === "true";

    const parsed = insertExpenseSchema.safeParse({
      categoryName,
      companyId,
      amount,
      taxAmount,
      currency: formData.get("currency") || "USD",
      date: formData.get("date"),
      name: formData.get("name"),
      description: formData.get("description"),
      paymentMode: formData.get("paymentMode") || "bank_transfer",
      reference: formData.get("reference"),
      isBillable,
      salesOrderId,
    });

    if (!parsed.success) {
      return {
        error: "Validation failed.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { updateExpense } = await import("@/features/expenses/services/expense.service");
    await updateExpense(id, parsed.data);

    revalidatePath("/expenses");
    return { success: true };
  } catch (err) {
    console.error("[updateExpenseAction]", err);
    return { error: err instanceof Error ? err.message : "Failed to update expense." };
  }
}

export async function deleteExpenseAction(_prevState: unknown, formData: FormData): Promise<{
  success?: boolean;
  error?: string;
}> {
  try {
    await getAuthenticatedUserId();

    const id = Number(formData.get("id"));
    if (!id) {
      return { error: "Expense ID is required." };
    }

    const { deleteExpense } = await import("@/features/expenses/services/expense.service");
    await deleteExpense(id);

    revalidatePath("/expenses");
    return { success: true };
  } catch (err) {
    console.error("[deleteExpenseAction]", err);
    return { error: err instanceof Error ? err.message : "Failed to delete expense." };
  }
}
