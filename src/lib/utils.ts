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
