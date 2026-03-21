/**
 * Architectural and Performance Constants
 */

export const DB_POOL_MAX = 5; // Balanced for Parallel dashboard queries (Promise.all) and Serverless safety
export const DB_IDLE_TIMEOUT = 20;
export const DB_CONNECT_TIMEOUT = 30;

// Re-render / UI constants
export const DASHBOARD_PADDING = "p-6";
export const DASHBOARD_SPACING = "6"; // For space-y-6
export const TABLE_PAGE_SIZE = 10;
