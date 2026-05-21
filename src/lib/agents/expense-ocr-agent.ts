import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { db } from "@/db";
import { agentActions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * The expected structure returned by the Gemini AI Model.
 * It matches the fields needed to create an Expense.
 */
export const expenseSchema = z.object({
  vendorName: z.string().describe("The name of the vendor, business, or supplier where the expense was incurred."),
  date: z.string().describe("The date of the expense or receipt in YYYY-MM-DD format."),
  amount: z.number().describe("The total amount of the expense, including tax."),
  taxAmount: z.number().describe("The total tax or GST amount on the receipt. Use 0 if not present or identifiable."),
  currency: z.string().default("USD").describe("The 3-letter currency code, e.g. USD, EUR, INR. Default is USD if not specified."),
  reference: z.string().nullable().describe("The receipt number, invoice number, or transaction ID. Null if unavailable."),
  categoryName: z.string().describe("The category of the expense. Suggest a category based on the provided list of existing categories, or create a new logical one if none fit."),
  description: z.string().nullable().describe("A brief description of what was purchased (e.g., 'Office Supplies', 'Uber Ride', 'Software Subscription')."),
});


/**
 * Runs the OCR task for an expense receipt using Google Gemini 2.5 Flash,
 * then saves the result to agent_actions as a pending draft for human review.
 * @param fileBuffer The uploaded file as a Node.js Buffer.
 * @param mimeType The mime type (e.g. application/pdf, image/jpeg).
 */
export async function runExpenseOcrAgent(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<{ taskId: number; status: string }> {

  // Fetch existing categories to guide the AI
  const existingCategories = await db.query.expenseCategories.findMany({
    columns: { name: true }
  });
  const categoryList = existingCategories.map(c => c.name).join(", ");

  const result = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: expenseSchema,
    system: `You are an expert data entry assistant for a business accounting system.
Your job is to extract billing information from expense receipts, bills, and invoices.
Read the provided document carefully and map the data to the required JSON structure.
If a field is not present explicitly, output null (for optional fields) or use your best judgement based on the context (like vendorName).
Be precise with numbers and dates. Always format dates as YYYY-MM-DD.

For categoryName, try to match exactly one of these existing categories if appropriate: [${categoryList}]. 
If none of them fit, suggest a new short, logical category name.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Please extract the expense details from this receipt document.",
          },
          {
            type: "file",
            data: new Uint8Array(fileBuffer),
            mediaType: mimeType,
          },
        ],
      },
    ],
  });

  const parsedPlan = result.object;

  // Dismiss any existing pending drafts for expense OCR so we only have one active draft at a time.
  const [task] = await db.transaction(async (tx) => {
    await tx
      .update(agentActions)
      .set({ status: "dismissed", resolvedAt: new Date() })
      .where(
        and(
          eq(agentActions.agentType, "expense_ocr"),
          eq(agentActions.status, "pending_approval"),
        ),
      );

    return tx
      .insert(agentActions)
      .values({
        agentType: "expense_ocr",
        status: "pending_approval",
        plan: parsedPlan as unknown as Record<string, unknown>,
        rationale: "Extracted expense data from uploaded receipt.",
        toolCalls: null,
      })
      .returning({ id: agentActions.id });
  });

  return { taskId: task.id, status: "pending_approval" };
}
