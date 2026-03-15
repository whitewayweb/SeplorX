import { sql } from "drizzle-orm";
import { channelProducts } from "@/db/schema";
import { getDistinctChannelProductField } from "../queries";

/**
 * Returns the Drizzle SQL expression to extract a given filter field (e.g. "brand", "category") 
 * from the channel_products.raw_data JSONB column. Used by the DAL for filtering and grouping.
 */
export function extractSqlField(fieldName: "brand" | "category" | string) {
  if (fieldName === "brand") {
    return sql<string>`NULLIF(${channelProducts.rawData}->'summaries'->0->>'brand', '')`;
  }
  if (fieldName === "category") {
    // Tries to pull the website display group (like "Auto Accessory") as a category
    return sql<string>`NULLIF(${channelProducts.rawData}->'summaries'->0->>'websiteDisplayGroup', '')`;
  }
  if (fieldName === "price") {
    return sql<string>`${channelProducts.rawData}->>'price'`;
  }
  if (fieldName === "itemCondition") {
    return sql<string>`${channelProducts.rawData}->>'item-condition'`;
  }
  if (fieldName === "partNumber") {
    return sql<string>`NULLIF(${channelProducts.rawData}->'summaries'->0->>'partNumber', '')`;
  }
  return null;
}

/**
 * Convenience method to get distinct brands for an Amazon channel instance
 */
export async function getBrands(channelId: number): Promise<string[]> {
  const expr = extractSqlField("brand");
  return expr ? getDistinctChannelProductField(channelId, expr) : [];
}
