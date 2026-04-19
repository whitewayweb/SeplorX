import { describe, it, expect } from "vitest";
import { CreateInvoiceSchema, UpdateInvoiceSchema, AddPaymentSchema } from "../invoices";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const validItem = {
  productId: 1,
  description: "A4 Paper Ream",
  quantity: 10,
  unitPrice: 5.50,
  taxPercent: 18,
};

const validInvoice = {
  invoiceNumber: "INV-2026-001",
  companyId: 1,
  invoiceDate: "2026-04-01",
  status: "received" as const,
  discountAmount: 0,
  items: [validItem],
};

// ─── CreateInvoiceSchema ──────────────────────────────────────────────────────

describe("CreateInvoiceSchema", () => {
  it("passes with a valid complete invoice", () => {
    expect(CreateInvoiceSchema.safeParse(validInvoice).success).toBe(true);
  });

  it("passes with optional dueDate provided", () => {
    const result = CreateInvoiceSchema.safeParse({ ...validInvoice, dueDate: "2026-05-01" });
    expect(result.success).toBe(true);
  });

  it("passes with notes provided", () => {
    const result = CreateInvoiceSchema.safeParse({ ...validInvoice, notes: "Net 30" });
    expect(result.success).toBe(true);
  });

  it("fails when invoiceNumber is empty", () => {
    const result = CreateInvoiceSchema.safeParse({ ...validInvoice, invoiceNumber: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/required/i);
  });

  it("fails when invoiceDate is empty", () => {
    const result = CreateInvoiceSchema.safeParse({ ...validInvoice, invoiceDate: "" });
    expect(result.success).toBe(false);
  });

  it("fails when companyId is zero", () => {
    const result = CreateInvoiceSchema.safeParse({ ...validInvoice, companyId: 0 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/select a company/i);
  });

  it("fails when items array is empty", () => {
    const result = CreateInvoiceSchema.safeParse({ ...validInvoice, items: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/at least one/i);
  });

  it("fails when discountAmount is negative", () => {
    const result = CreateInvoiceSchema.safeParse({ ...validInvoice, discountAmount: -10 });
    expect(result.success).toBe(false);
  });

  it("accepts multiple items", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      items: [validItem, { ...validItem, productId: 2, description: "Pen Pack" }],
    });
    expect(result.success).toBe(true);
  });

  // ── Line item validations ──

  it("fails when line item quantity is zero", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice, items: [{ ...validItem, quantity: 0 }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/whole number/i);
  });

  it("fails when line item quantity is a float", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice, items: [{ ...validItem, quantity: 2.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("fails when line item quantity is negative", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice, items: [{ ...validItem, quantity: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("fails when taxPercent exceeds 100", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice, items: [{ ...validItem, taxPercent: 101 }],
    });
    expect(result.success).toBe(false);
  });

  it("fails when taxPercent is negative", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice, items: [{ ...validItem, taxPercent: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("passes when taxPercent is 0 (zero-rated)", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice, items: [{ ...validItem, taxPercent: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("passes when taxPercent is 100 (boundary)", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice, items: [{ ...validItem, taxPercent: 100 }],
    });
    expect(result.success).toBe(true);
  });

  it("fails when unitPrice is negative", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice, items: [{ ...validItem, unitPrice: -5 }],
    });
    expect(result.success).toBe(false);
  });

  it("passes when unitPrice is 0 (free item)", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice, items: [{ ...validItem, unitPrice: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("allows null productId (unmapped / manual line item)", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice, items: [{ ...validItem, productId: null }],
    });
    expect(result.success).toBe(true);
  });

  it("fails when line item description is empty", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice, items: [{ ...validItem, description: "" }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/required/i);
  });

  it("passes with all valid invoice statuses", () => {
    const statuses = ["draft", "received", "partial", "paid", "cancelled"] as const;
    for (const status of statuses) {
      const result = CreateInvoiceSchema.safeParse({ ...validInvoice, status });
      expect(result.success).toBe(true);
    }
  });
});

// ─── UpdateInvoiceSchema ──────────────────────────────────────────────────────

describe("UpdateInvoiceSchema", () => {
  const validUpdate = { id: 1, ...validInvoice };

  it("passes with valid id included", () => {
    expect(UpdateInvoiceSchema.safeParse(validUpdate).success).toBe(true);
  });

  it("fails when id is missing", () => {
    const withoutId = { ...validUpdate } as Record<string, unknown>;
    delete withoutId.id;
    expect(UpdateInvoiceSchema.safeParse(withoutId).success).toBe(false);
  });

  it("fails when id is zero", () => {
    expect(UpdateInvoiceSchema.safeParse({ ...validUpdate, id: 0 }).success).toBe(false);
  });
});

// ─── AddPaymentSchema ─────────────────────────────────────────────────────────

describe("AddPaymentSchema", () => {
  const validPayment = {
    invoiceId: 1,
    amount: 500,
    paymentDate: "2026-04-01",
    paymentMode: "bank_transfer" as const,
  };

  it("passes with a valid payment", () => {
    expect(AddPaymentSchema.safeParse(validPayment).success).toBe(true);
  });

  it("passes with all optional fields", () => {
    const result = AddPaymentSchema.safeParse({
      ...validPayment, reference: "TXN-123456", notes: "Monthly settlement",
    });
    expect(result.success).toBe(true);
  });

  it("fails when amount is zero", () => {
    const result = AddPaymentSchema.safeParse({ ...validPayment, amount: 0 });
    expect(result.success).toBe(false);
  });

  it("fails when amount is negative", () => {
    const result = AddPaymentSchema.safeParse({ ...validPayment, amount: -100 });
    expect(result.success).toBe(false);
  });

  it("fails with invalid paymentMode", () => {
    const result = AddPaymentSchema.safeParse({ ...validPayment, paymentMode: "bitcoin" });
    expect(result.success).toBe(false);
  });

  it("passes with all valid payment modes", () => {
    const modes = ["cash", "bank_transfer", "upi", "cheque", "other"] as const;
    for (const paymentMode of modes) {
      const result = AddPaymentSchema.safeParse({ ...validPayment, paymentMode });
      expect(result.success).toBe(true);
    }
  });

  it("fails when invoiceId is zero", () => {
    const result = AddPaymentSchema.safeParse({ ...validPayment, invoiceId: 0 });
    expect(result.success).toBe(false);
  });

  it("fails when paymentDate is empty", () => {
    const result = AddPaymentSchema.safeParse({ ...validPayment, paymentDate: "" });
    expect(result.success).toBe(false);
  });

  it("coerces amount from numeric string", () => {
    const result = AddPaymentSchema.safeParse({ ...validPayment, amount: "250.50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBe(250.5);
  });
});
