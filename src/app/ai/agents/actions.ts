"use server"

import { db } from "@/db";
import { settings } from "@/db/schema";
import { revalidatePath } from "next/cache";

/**
 * Toggles an AI agent on or off platform-wide.
 */
export async function toggleAgent(agentId: string, isActive: boolean) {
  try {
    const key = `agent:${agentId}:isActive`;

    await db.insert(settings)
      .values({ key, value: isActive })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: isActive, updatedAt: new Date() },
      });

    revalidatePath("/ai/agents");
    return { success: true };
  } catch (error) {
    console.error("[toggleAgent]", { agentId, error: String(error) });
    return { success: false, error: "Failed to update agent settings." };
  }
}
