import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { db } from "@/db";
import { agentActions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

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
      hsnCode: z.string().nullable().describe(
        "The HSN or SAC tax classification code for this item, if shown on the invoice (typically a 4–8 digit number like '87088000'). This is a government tax code — NOT a product SKU."
      ),
      skuOrItemCode: z.string().nullable().describe(
        "The supplier's actual part number, item code, or catalog reference for this product. " +
        "IMPORTANT: HSN/SAC codes are tax classification numbers — do NOT use them here (put them in hsnCode instead). " +
        "If the invoice shows only an HSN code with no actual part number, generate a short descriptive SKU " +
        "from the product name using 2–4 uppercase abbreviated keywords " +
        "(e.g. 'CAR COIL SPRING BUFFER - A' → 'CCSB-A', 'BRAKE PAD SET REAR' → 'BPS-R'). " +
        "Generated SKUs must be unique within this invoice."
      ),
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
 * Runs the OCR task using Google Gemini 2.0 Flash,
 * then saves the result to agent_actions as a pending draft for human review.
 * @param fileBuffer The uploaded file as a Node.js Buffer.
 * @param mimeType The mime type (e.g. application/pdf, image/jpeg).
 */
export async function runOcrAgent(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<{ taskId: number; status: string }> {
  const result = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: invoiceSchema,
    system: `You are an expert data entry assistant for a B2B wholesale distribution business.
Your job is to extract billing information and physical product line items from supplier purchase invoices.
Read the provided document carefully and map the data to the required JSON structure.
Pay close attention to Part Numbers, HSN/SAC codes, and Units of Measure.
HSN/SAC tax codes (typically 4–8 digit numbers) belong in hsnCode — never in skuOrItemCode.
If no actual part number is present, generate a concise descriptive SKU from the product name.
If a field is not present explicitly, output null.
Be precise with numbers and do not invent any data.`,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Please extract the invoice details from this document." },
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

  // Dismiss any existing pending drafts, then insert the new one — atomically.
  // This ensures only one OCR card is ever shown at a time; uploading a new
  // bill replaces the old unreviewed draft rather than stacking a second card.
  const [task] = await db.transaction(async (tx) => {
    await tx
      .update(agentActions)
      .set({ status: "dismissed", resolvedAt: new Date() })
      .where(
        and(
          eq(agentActions.agentType, "invoice_ocr"),
          eq(agentActions.status, "pending_approval"),
        ),
      );

    return tx
      .insert(agentActions)
      .values({
        agentType: "invoice_ocr",
        status: "pending_approval",
        plan: parsedPlan as unknown as Record<string, unknown>,
        rationale: "Extracted data from uploaded document.",
        toolCalls: null,
      })
      .returning({ id: agentActions.id });
  });

  return { taskId: task.id, status: "pending_approval" };
}
