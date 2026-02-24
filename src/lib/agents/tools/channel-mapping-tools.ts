/**
 * Tools for the Channel Mapping Agent.
 *
 * These tools are READ-ONLY except for proposeChannelMappings which
 * writes to agent_actions (not to core tables). All actual mapping
 * writes happen via Server Actions after human approval.
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { products, channels, channelProductMappings, agentActions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getChannelHandler } from "@/lib/channels/registry";
import { decrypt } from "@/lib/crypto";

const CURRENT_USER_ID = 1;

// ─── Shared plan types (exported for use in approval card + action) ────────────

export type ChannelMappingProposal = {
  seplorxProductId: number;
  seplorxProductName: string;
  seplorxSku: string | null;
  externalProductId: string;
  externalProductName: string;
  externalSku: string | null;
  confidence: "high" | "medium" | "low";
  rationale: string;
};

export type ChannelMappingPlan = {
  channelId: number;
  channelName: string;
  proposals: ChannelMappingProposal[];
  /** WC product names/SKUs with no SeplorX match — informational only */
  unmatched: string[];
  reasoning: string;
};

// ─── Tool 1: Get all active SeplorX products ─────────────────────────────────

export const getSeplorxProducts = tool({
  description:
    "Get all active SeplorX products. " +
    "Returns id, name, and sku for each product. " +
    "Use this to understand what products exist in SeplorX before attempting to match them to channel products.",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    return await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
      })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(products.name);
  },
});

// ─── Tool 2: Get unmapped channel products ────────────────────────────────────

export const getChannelProducts = tool({
  description:
    "Fetch products from a connected channel (e.g. WooCommerce store) and return only the UNMAPPED ones. " +
    "Already-mapped WC products are filtered out — the agent should only propose NEW links. " +
    "Returns channelName, channelType, unmapped products list, and how many were already mapped.",
  inputSchema: zodSchema(
    z.object({
      channelId: z.number().int().describe("The SeplorX channel ID to fetch products from"),
    }),
  ),
  execute: async ({ channelId }) => {
    // Load channel row
    const channelRows = await db
      .select({
        id: channels.id,
        name: channels.name,
        channelType: channels.channelType,
        storeUrl: channels.storeUrl,
        credentials: channels.credentials,
        status: channels.status,
      })
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.userId, CURRENT_USER_ID)))
      .limit(1);

    if (channelRows.length === 0) {
      throw new Error(`Channel ${channelId} not found.`);
    }

    const channel = channelRows[0];
    if (channel.status !== "connected") {
      throw new Error(`Channel ${channelId} is not connected (status: ${channel.status}).`);
    }

    const handler = getChannelHandler(channel.channelType);
    if (!handler || !handler.fetchProducts) {
      throw new Error(`Channel type "${channel.channelType}" does not support product listing.`);
    }

    if (!channel.storeUrl) {
      throw new Error(`Channel ${channelId} has no store URL configured.`);
    }

    const creds = channel.credentials ?? {};
    const consumerKey = creds.consumerKey ? decrypt(creds.consumerKey) : "";
    const consumerSecret = creds.consumerSecret ? decrypt(creds.consumerSecret) : "";

    if (!consumerKey || !consumerSecret) {
      throw new Error(`Channel ${channelId} is missing credentials.`);
    }

    const externalProducts = await handler.fetchProducts(
      channel.storeUrl,
      { consumerKey, consumerSecret },
    );

    // Collect all already-mapped externalProductIds for this channel
    const mappedRows = await db
      .select({ externalProductId: channelProductMappings.externalProductId })
      .from(channelProductMappings)
      .where(eq(channelProductMappings.channelId, channelId));

    const mappedIds = new Set(mappedRows.map((r) => r.externalProductId));
    const alreadyMappedCount = mappedIds.size;

    const unmappedProducts = externalProducts.filter((p) => !mappedIds.has(p.id));

    return {
      channelName: channel.name,
      channelType: channel.channelType,
      products: unmappedProducts.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku ?? null,
        stockQuantity: p.stockQuantity ?? null,
      })),
      alreadyMappedCount,
    };
  },
});

// ─── Tool 3: Propose channel mappings (writes to agent_actions only) ──────────

export const proposeChannelMappings = tool({
  description:
    "Submit your channel-to-SeplorX product mapping proposals for human review. " +
    "This does NOT create any mappings — it saves the proposals to the approval queue. " +
    "Call this once when you have finished matching and are ready to present your recommendations. " +
    "Do NOT call this if there are zero proposals.",
  inputSchema: zodSchema(
    z.object({
      channelId: z.number().int().describe("The channel ID being mapped"),
      channelName: z.string().describe("Human-readable channel name"),
      proposals: z
        .array(
          z.object({
            seplorxProductId: z.number().int(),
            seplorxProductName: z.string(),
            seplorxSku: z.string().nullable(),
            externalProductId: z.string(),
            externalProductName: z.string(),
            externalSku: z.string().nullable(),
            confidence: z.enum(["high", "medium", "low"]),
            rationale: z.string(),
          }),
        )
        .min(1, "Must include at least one proposal"),
      unmatched: z
        .array(z.string())
        .describe("WC product names (or name + SKU) with no good SeplorX match"),
      reasoning: z.string().describe("Brief summary of matching strategy and overall confidence"),
    }),
  ),
  execute: async ({ channelId, channelName, proposals, unmatched, reasoning }) => {
    const plan: ChannelMappingPlan = {
      channelId,
      channelName,
      proposals,
      unmatched,
      reasoning,
    };

    const [row] = await db
      .insert(agentActions)
      .values({
        agentType: "channel_mapping",
        status: "pending_approval",
        plan: plan as unknown as Record<string, unknown>,
      })
      .returning({ id: agentActions.id });

    return { taskId: row.id };
  },
});
