import { db } from "@/db";
import { appInstallations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getUserAppInstallations(userId: number) {
  return await db
    .select({
      id: appInstallations.id,
      appId: appInstallations.appId,
      status: appInstallations.status,
      config: appInstallations.config,
    })
    .from(appInstallations)
    .where(eq(appInstallations.userId, userId));
}
