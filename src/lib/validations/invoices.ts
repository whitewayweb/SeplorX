import { z } from "zod";

const invoiceStatuses = ["draft", "received", "partial", "paid", "cancelled"] as const;
const paymentModes = ["cash", "bank_transfer", "upi", "cheque", "other"] as const;

// ─── Line Item Schema ────────────────────────────────────────────────────────

const LineItemSchema = z.object({
  productId: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? null : Number(val)),
    z.number().int().positive().nullable(),
  ),
  description: z.string().trim().min(1, "Description is required"),
  quantity: z.coerce.number().positive("Quantity must be > 0"),
  unitPrice: z.coerce.number().min(0, "Unit price must be ≥ 0"),
  taxPercent: z.coerce.number().min(0).max(100, "Tax % must be 0-100"),
});

// ─── Invoice Schemas ─────────────────────────────────────────────────────────

export const CreateInvoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1, "Invoice number is required"),
  companyId: z.coerce.number().int().positive("Select a company"),
  invoiceDate: z.string().trim().min(1, "Invoice date is required"),
  dueDate: z.string().trim().optional().or(z.literal("")),
  status: z.enum(invoiceStatuses).default("received"),
  discountAmount: z.coerce.number().min(0, "Discount must be ≥ 0"),
  notes: z.string().trim().optional().or(z.literal("")),
  items: z.array(LineItemSchema).min(1, "At least one line item is required"),
});

export const UpdateInvoiceSchema = z.object({
  id: z.coerce.number().int().positive("Invalid invoice ID"),
  invoiceNumber: z.string().trim().min(1, "Invoice number is required"),
  invoiceDate: z.string().trim().min(1, "Invoice date is required"),
  dueDate: z.string().trim().optional().or(z.literal("")),
  status: z.enum(invoiceStatuses),
  discountAmount: z.coerce.number().min(0, "Discount must be ≥ 0"),
  notes: z.string().trim().optional().or(z.literal("")),
});

export const InvoiceIdSchema = z.object({
  id: z.coerce.number().int().positive("Invalid invoice ID"),
});

// ─── Payment Schema ──────────────────────────────────────────────────────────

export const AddPaymentSchema = z.object({
  invoiceId: z.coerce.number().int().positive("Invalid invoice ID"),
  amount: z.coerce.number().positive("Amount must be > 0"),
  paymentDate: z.string().trim().min(1, "Payment date is required"),
  paymentMode: z.enum(paymentModes, { message: "Invalid payment mode" }),
  reference: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export const PaymentIdSchema = z.object({
  id: z.coerce.number().int().positive("Invalid payment ID"),
});

export type LineItemInput = z.infer<typeof LineItemSchema>;
