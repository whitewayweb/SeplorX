import type { AppCategory, AppDefinition } from "./types";

export const appRegistry: AppDefinition[] = [
  {
    id: "shree-maruti",
    name: "Shree Maruti",
    description: "Domestic courier integration for shipping across India.",
    category: "logistics",
    icon: "truck",
    configFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "accountId", label: "Account ID", type: "text", required: true },
    ],
  },
  {
    id: "delhivery",
    name: "Delhivery",
    description: "Express and freight shipping integration.",
    category: "logistics",
    icon: "package",
    configFields: [
      { key: "apiToken", label: "API Token", type: "password", required: true },
      { key: "clientName", label: "Client Name", type: "text", required: true },
      { key: "warehouseCode", label: "Warehouse Code", type: "text", placeholder: "e.g. WH-001", required: false },
    ],
  },
  {
    id: "dhl",
    name: "DHL",
    description: "International shipping and tracking integration.",
    category: "logistics",
    icon: "plane",
    configFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "siteId", label: "Site ID", type: "text", required: true },
      { key: "apiPassword", label: "API Password", type: "password", required: true },
      { key: "accountNumber", label: "Account Number", type: "text", required: true },
    ],
  },
  {
    id: "fedex",
    name: "FedEx",
    description: "Shipping, tracking, and rate calculation integration.",
    category: "logistics",
    icon: "box",
    configFields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", required: true },
      { key: "accountNumber", label: "Account Number", type: "text", required: true },
    ],
  },
];

export function getAppsByCategory(category: AppCategory): AppDefinition[] {
  return appRegistry.filter((app) => app.category === category);
}

export function getAppById(id: string): AppDefinition | undefined {
  return appRegistry.find((app) => app.id === id);
}

export function getCategories(): AppCategory[] {
  return [...new Set(appRegistry.map((app) => app.category))];
}

export const categoryLabels: Record<AppCategory, string> = {
  logistics: "Logistics",
  payment: "Payment",
  sms: "SMS",
  email: "Email",
};
