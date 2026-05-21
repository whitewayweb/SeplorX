import { z } from "zod";

// Schema for validating the final expense submission (after human review)
export const insertExpenseSchema = z.object({
  categoryId: z.number().positive().nullable().optional(),
  amount: z.number().min(0),
  taxAmount: z.number().min(0).default(0),
  currency: z.string().default("USD"),
  date: z.string(),
  name: z.string().min(1, "Vendor name is required"),
  description: z.string().nullable().optional(),
  paymentMode: z.enum(["cash", "bank_transfer", "upi", "cheque", "other"]).default("bank_transfer"),
  reference: z.string().nullable().optional(),
  isBillable: z.boolean().default(false),
  salesOrderId: z.number().positive().nullable().optional(),
});

export type InsertExpenseParams = z.input<typeof insertExpenseSchema>;
