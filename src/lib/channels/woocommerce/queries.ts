import { sql } from "drizzle-orm";
import { channelProducts } from "@/db/schema";
import { getDistinctChannelProductField } from "../queries";

/**
 * Returns the Drizzle SQL expression to extract a given filter field (e.g. "brand", "category") 
 * from the channel_products.raw_data JSONB column. Used by the DAL for filtering and grouping.
 */
export function extractSqlField(fieldName: "brand" | "category" | string) {
  if (fieldName === "brand") {
    return sql<string>`NULLIF(jsonb_path_query_first(
      CASE 
        WHEN jsonb_typeof(${channelProducts.rawData}->'attributes') = 'array' 
        THEN ${channelProducts.rawData}->'attributes' 
        ELSE '[]'::jsonb 
      END,
      '$[*] ? (@.name == "brand" || @.name == "Brand" || @.name == "Brands").options[0]'
    )#>>'{}', '')`;
  }
  if (fieldName === "category") {
    return sql<string>`NULLIF(jsonb_path_query_first(
      CASE 
        WHEN jsonb_typeof(${channelProducts.rawData}->'categories') = 'array' 
        THEN ${channelProducts.rawData}->'categories' 
        ELSE '[]'::jsonb 
      END,
      '$[0].name'
    )#>>'{}', '')`;
  }
  if (fieldName === "price") {
    return sql<string>`COALESCE(${channelProducts.rawData}->>'price', ${channelProducts.rawData}->>'regular_price')`;
  }
  if (fieldName === "itemCondition") {
    return sql<string>`${channelProducts.rawData}->>'item-condition'`;
  }
  return null;
}

/**
 * Convenience method to get distinct brands for a WooCommerce channel instance
 */
export async function getBrands(channelId: number): Promise<string[]> {
  const expr = extractSqlField("brand");
  return expr ? getDistinctChannelProductField(channelId, expr) : [];
}
