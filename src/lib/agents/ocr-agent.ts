import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { db } from "@/db";
import { agentActions } from "@/db/schema";

/**
 * The expected structure returned by the Gemini AI Model.
 * It matches the fields needed to create a Purchase Invoice and Invoice Items
 * based on `src/db/schema.ts` specifications.
 */
export const invoiceSchema = z.object({
  supplierName: z.string().describe("The name of the company/vendor/supplier on the invoice."),
  supplierGstNumber: z.string().nullable().describe("The GST or Tax ID number of the supplier, if available."),
  supplierEmail: z.string().nullable().describe("The email address of the supplier, if available."),
  supplierPhone: z.string().nullable().describe("The phone number of the supplier, if available."),
  invoiceNumber: z.string().nullable().describe("The invoice or receipt number."),
  invoiceDate: z.string().nullable().describe("The date of the invoice in YYYY-MM-DD format."),
  dueDate: z.string().nullable().describe("The due date for payment in YYYY-MM-DD format, if specified."),
  purchaseOrderNumber: z.string().nullable().describe("The PO (Purchase Order) number referenced by the supplier, if available."),
  subtotal: z.number().describe("The subtotal amount before taxes and discounts."),
  discountAmount: z.number().describe("Any global discount applied to the invoice. Use 0 if none."),
  taxAmount: z.number().describe("The total tax or GST amount on the invoice."),
  totalAmount: z.number().describe("The final total amount to be paid."),
  items: z.array(
    z.object({
      description: z.string().describe("The product name or description of the item."),
      skuOrItemCode: z.string().nullable().describe("The supplier's part number, item code, or SKU, if available."),
      quantity: z.number().describe("The quantity of the item purchased."),
      unitOfMeasure: z.string().nullable().describe("The unit (e.g., pcs, kg, boxes), if available."),
      unitPrice: z.number().describe("The price per single unit."),
      taxPercent: z.number().describe("The tax percentage (e.g. 5, 12, 18) applied to this item. Use 0 if none."),
      taxAmount: z.number().describe("The tax amount for this specific item. Use 0 if none."),
      totalAmount: z.number().describe("The total price for this line item including tax.")
    })
  ).describe("The list of products or materials purchased on the invoice.")
});

export type ExtractedInvoice = z.infer<typeof invoiceSchema>;

/**
 * Runs the synchronous OCR task using Google Gemini 1.5 Flash, 
 * then saves the result to agent_actions as a pending draft.
 * @param base64File The uploaded file converted to base64.
 * @param mimeType The mime type (e.g. application/pdf, image/jpeg).
 */
export async function runOcrAgent(base64File: string, mimeType: string): Promise<{ taskId: number, status: string }> {
  const result = await generateObject({
    model: google("gemini-1.5-flash"),
    schema: invoiceSchema,
    system: `You are an expert data entry assistant for a B2B wholesale distribution business.
Your job is to extract billing information and physical product line items from supplier purchase invoices.
Read the provided document carefully and map the data to the required JSON structure.
Pay close attention to SKUs/Part Numbers and Units of Measure.
If a field is not present explicitly, output null.
Be precise with numbers and do not invent any data.`,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Please extract the invoice details from this document." },
          {
            type: "file",
            data: base64File,
            mediaType: mimeType,
          },
        ],
      },
    ],
  });

  const parsedPlan = result.object;

  // Insert into agent_actions table as a draft awaiting human review
  const [task] = await db
    .insert(agentActions)
    .values({
      agentType: "invoice_ocr",
      status: "pending_approval",
      plan: parsedPlan as unknown as Record<string, unknown>,
      rationale: "Extracted data from uploaded document.",
      toolCalls: null,
    })
    .returning({ id: agentActions.id });

  return { taskId: task.id, status: "pending_approval" };
}
