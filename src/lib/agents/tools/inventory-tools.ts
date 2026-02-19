/**
 * Read-only tools for the Reorder Agent.
 *
 * These tools ONLY read from the database. They never write to core tables.
 * The agent uses them to gather context and reason about a recommendation.
 * Actual writes happen via Server Actions after human approval.
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import { db } from "@/db";
import {
  products,
  purchaseInvoices,
  purchaseInvoiceItems,
  companies,
  agentActions,
} from "@/db/schema";
import { and, desc, eq, lte, sql } from "drizzle-orm";

// ─── Tool 1: Get low-stock products ──────────────────────────────────────────

export const getLowStockProducts = tool({
  description:
    "Get all active products where quantity_on_hand is at or below reorder_level. " +
    "Returns an empty array if no products are low on stock.",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    return await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        unit: products.unit,
        quantityOnHand: products.quantityOnHand,
        reorderLevel: products.reorderLevel,
        purchasePrice: products.purchasePrice,
      })
      .from(products)
      .where(
        and(
          eq(products.isActive, true),
          lte(products.quantityOnHand, products.reorderLevel),
        ),
      )
      .orderBy(products.quantityOnHand);
  },
});

// ─── Tool 2: Get preferred supplier for a product ────────────────────────────

export const getPreferredSupplier = tool({
  description:
    "Find the supplier company that appears most often in purchase invoices for a given product. " +
    "Returns the company id, name, and the unit price from their most recent invoice item. " +
    "Returns null if the product has never been purchased.",
  inputSchema: zodSchema(
    z.object({
      productId: z.number().int().describe("The product id to look up supplier history for"),
    }),
  ),
  execute: async ({ productId }) => {
    const rows = await db
      .select({
        companyId: purchaseInvoices.companyId,
        companyName: companies.name,
        lastUnitPrice: purchaseInvoiceItems.unitPrice,
        orderCount: sql<number>`count(*)::int`,
      })
      .from(purchaseInvoiceItems)
      .innerJoin(
        purchaseInvoices,
        eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id),
      )
      .innerJoin(companies, eq(purchaseInvoices.companyId, companies.id))
      .where(eq(purchaseInvoiceItems.productId, productId))
      .groupBy(
        purchaseInvoices.companyId,
        companies.name,
        purchaseInvoiceItems.unitPrice,
      )
      .orderBy(sql`count(*) DESC`)
      .limit(1);

    return rows[0] ?? null;
  },
});

// ─── Tool 3: Get last order quantity for a product from a supplier ────────────

export const getLastOrderQuantity = tool({
  description:
    "Get the quantity ordered in the most recent purchase invoice for a specific product from a specific supplier. " +
    "Returns null if no prior order exists for this product/supplier combination.",
  inputSchema: zodSchema(
    z.object({
      productId: z.number().int().describe("The product id"),
      companyId: z.number().int().describe("The supplier company id"),
    }),
  ),
  execute: async ({ productId, companyId }) => {
    const rows = await db
      .select({
        quantity: purchaseInvoiceItems.quantity,
        invoiceDate: purchaseInvoices.invoiceDate,
        invoiceNumber: purchaseInvoices.invoiceNumber,
      })
      .from(purchaseInvoiceItems)
      .innerJoin(
        purchaseInvoices,
        eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id),
      )
      .where(
        and(
          eq(purchaseInvoiceItems.productId, productId),
          eq(purchaseInvoices.companyId, companyId),
        ),
      )
      .orderBy(desc(purchaseInvoices.invoiceDate))
      .limit(1);

    return rows[0] ?? null;
  },
});

// ─── Shared types ──────────────────────────────────────────────────────────────

export type ReorderItem = {
  productId: number;
  productName: string;
  sku: string | null;
  unit: string;
  quantity: number;
  unitPrice: string;
  rationale: string;
};

export type ReorderPlan = {
  companyId: number;
  companyName: string;
  items: ReorderItem[];
  totalEstimate: string;
  reasoning: string;
};

// ─── Tool 4: Propose a purchase order (writes to agent_actions, not core tables) ──

export const proposeReorderPlan = tool({
  description:
    "Submit the final purchase order recommendation for human review. " +
    "This does NOT create any invoice or modify any data — it only saves the proposal to the approval queue. " +
    "Call this once you have gathered all information and are ready to present your recommendation.",
  inputSchema: zodSchema(
    z.object({
      companyId: z.number().int(),
      companyName: z.string(),
      items: z.array(
        z.object({
          productId: z.number().int(),
          productName: z.string(),
          sku: z.string().nullable(),
          unit: z.string(),
          quantity: z.number().int().positive(),
          unitPrice: z.string(),
          rationale: z.string(),
        }),
      ),
      totalEstimate: z.string(),
      reasoning: z.string().describe("Brief explanation of why this order is recommended"),
    }),
  ),
  execute: async (plan) => {
    const [task] = await db
      .insert(agentActions)
      .values({
        agentType: "reorder",
        status: "pending_approval",
        plan: plan as unknown as Record<string, unknown>,
        rationale: plan.reasoning,
        toolCalls: null,
      })
      .returning({ id: agentActions.id });

    return { taskId: task.id, status: "pending_approval" };
  },
});
