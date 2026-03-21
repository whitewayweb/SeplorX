/**
 * Architectural and Performance Constants
 */

export const DB_POOL_MAX = 5; // Balanced for Parallel dashboard queries (Promise.all) and Serverless safety
export const DB_IDLE_TIMEOUT = 20;
export const DB_CONNECT_TIMEOUT = 30;

