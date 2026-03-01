import { db } from "@/db";
import { channels } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Data Access Layer (DAL) for channels.
 * Extracts database queries from UI components (Server Components) 
 * to ensure a clean separation of concerns and reusability.
 */

export async function getUserChannels(userId: number) {
  return await db
    .select({
      id: channels.id,
      name: channels.name,
    })
    .from(channels)
    .where(eq(channels.userId, userId));
}
