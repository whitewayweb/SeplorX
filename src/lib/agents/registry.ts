/**
 * Agent Registry — single source of truth for all AI agents.
 * Mirrors the Apps registry pattern: definitions live in code, state in the DB.
 *
 * To add a new agent: add one entry here. Nothing else changes in the CRUD layer.
 * To disable an agent: set enabled: false. Its route returns 503, its UI button is hidden.
 */

export const AGENT_REGISTRY = {
  reorder: {
    id: "reorder",
    name: "Low-Stock Reorder Assistant",
    description: "Detects products below reorder level and drafts a purchase order for your review.",
    enabled: true,
    route: "/api/agents/reorder",
    triggerPage: "/inventory",
  },
  invoice_ocr: {
    id: "invoice_ocr",
    name: "AI Invoice Extractor",
    description: "Extracts supplier details and line items from an uploaded invoice image or PDF.",
    enabled: true,
    route: "/api/agents/ocr",
    triggerPage: "/purchase/bills",
  },
  channelMapping: {
    id: "channelMapping",
    name: "Channel Product Mapper",
    description: "Automatically matches your SeplorX products to WooCommerce products by name and SKU. Only proposes new links — skips already-mapped products.",
    enabled: true,
    route: "/api/agents/channel-mapping",
    triggerPage: "/channels",
  },
} as const;
