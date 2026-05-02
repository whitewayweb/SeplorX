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

function addIndianDigitGrouping(value: string): string {
  const [firstGroup, ...remainingGroups] = value.split(".");
  const sign = firstGroup.startsWith("-") ? "-" : "";
  const digits = sign ? firstGroup.slice(1) : firstGroup;

  if (digits.length <= 3) {
    return `${sign}${digits}${remainingGroups.length > 0 ? `.${remainingGroups.join(".")}` : ""}`;
  }

  const lastThree = digits.slice(-3);
  const leadingDigits = digits.slice(0, -3);
  const groupedLeading = leadingDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${sign}${groupedLeading},${lastThree}${remainingGroups.length > 0 ? `.${remainingGroups.join(".")}` : ""}`;
}

export function formatNumber(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return addIndianDigitGrouping(Math.trunc(safeValue).toString());
}

export function formatCurrency(amount: number, currency = "INR"): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `${currency} ${addIndianDigitGrouping(safeAmount.toFixed(2))}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
