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
  overdue: {
    id: "overdue",
    name: "Overdue Invoice Reminder",
    description: "Drafts payment reminders for overdue supplier invoices.",
    enabled: false,
    route: "/api/agents/overdue",
    triggerPage: "/invoices",
  },
  rateCompare: {
    id: "rate-compare",
    name: "Carrier Rate Comparison",
    description: "Compares rates across your configured shipping carriers and recommends the best option.",
    enabled: false,
    route: "/api/agents/rate-compare",
    triggerPage: "/invoices/[id]",
  },
} as const;

export type AgentId = keyof typeof AGENT_REGISTRY;
export type AgentConfig = (typeof AGENT_REGISTRY)[AgentId];
