/**
 * Shared pagination utilities for server pages that use TablePagination + TableSearch.
 *
 * Centralises validation of untrusted URL query params (`page`, `limit`, `q`) so
 * every page gets identical, safe defaults without duplicating the logic.
 */

/** Limit values exposed by the TablePagination "Rows per page" dropdown. */
export const PAGINATION_LIMITS = [25, 50, 100, 200, 500] as const;
export type PaginationLimit = (typeof PAGINATION_LIMITS)[number];

export const DEFAULT_LIMIT: PaginationLimit = 25;

export interface ParsedPaginationParams {
  /** Validated search query string (empty string when absent). */
  query: string;
  /** Validated page number, clamped to ≥ 1. */
  page: number;
  /** Validated limit, restricted to PAGINATION_LIMITS; falls back to DEFAULT_LIMIT. */
  limit: PaginationLimit;
  /** SQL OFFSET derived from page and limit. */
  offset: number;
}

/**
 * Parse and validate the `q`, `page`, and `limit` search-params coming from
 * an untrusted URL. Safe to call directly inside any Next.js server page.
 *
 * @example
 * const { query, page, limit, offset } = parsePaginationParams(await searchParams);
 */
export function parsePaginationParams(
  searchParams: Record<string, string | string[] | undefined>
): ParsedPaginationParams {
  const query = typeof searchParams?.q === "string" ? searchParams.q : "";

  // `limit` must be one of the values the TablePagination UI exposes.
  // Arbitrary values (e.g. limit=99999) fall back to the default.
  const rawLimit = parseInt((searchParams?.limit as string) || "", 10);
  const limit = (PAGINATION_LIMITS as readonly number[]).includes(rawLimit)
    ? (rawLimit as PaginationLimit)
    : DEFAULT_LIMIT;

  // `page` must be a positive integer. Negatives and NaN reset to 1.
  const rawPage = parseInt((searchParams?.page as string) || "1", 10);
  const page = !isNaN(rawPage) && rawPage >= 1 ? rawPage : 1;

  const offset = (page - 1) * limit;

  return { query, page, limit, offset };
}
