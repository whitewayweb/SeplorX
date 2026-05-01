import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Dynamically resolves the base URL from request headers.
 * Safe for Vercel preview deployments and local dev, as it relies on the actual incoming request.
 */
export function getBaseUrl(headersObj: Headers): string {
  const host = headersObj.get("host");
  const isLocal = host?.includes("localhost") || host?.includes("127.0.0.1");
  const protocol = headersObj.get("x-forwarded-proto") || (isLocal ? "http" : "https");
  return `${protocol}://${host}`;
}

export function formatCurrency(amount: number, currency = "INR", compact = false): string {
  if (compact && amount >= 100000) {
    return `${currency} ${(amount / 100000).toFixed(amount >= 1000000 ? 1 : 2)}L`;
  }
  return `${currency} ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
