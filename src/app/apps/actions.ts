"use server";

import { db } from "@/db";
import { appInstallations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getAppById } from "@/lib/apps";
import { InstallAppSchema, UninstallAppSchema, buildAppConfigSchema } from "@/lib/validations/apps";

// TODO: replace with auth() when auth is re-added
const CURRENT_USER_ID = 1;

export async function installApp(_prevState: unknown, formData: FormData) {
  const parsed = InstallAppSchema.safeParse({
    appId: formData.get("appId"),
  });

  if (!parsed.success) {
    return { error: "Invalid app ID." };
  }

  const { appId } = parsed.data;
  const app = getAppById(appId);
  if (!app) {
    return { error: "App not found." };
  }

  const existing = await db
    .select({ id: appInstallations.id })
    .from(appInstallations)
    .where(and(eq(appInstallations.userId, CURRENT_USER_ID), eq(appInstallations.appId, appId)))
    .limit(1);

  if (existing.length > 0) {
    return { error: "App is already installed." };
  }

  await db.insert(appInstallations).values({
    userId: CURRENT_USER_ID,
    appId,
    status: "installed",
    config: {},
  });

  revalidatePath("/apps");
  return { success: true };
}

export async function configureApp(_prevState: unknown, formData: FormData) {
  const appId = formData.get("appId") as string;

  const app = getAppById(appId);
  if (!app) {
    return { error: "App not found." };
  }

  const config: Record<string, string> = {};
  for (const field of app.configFields) {
    config[field.key] = (formData.get(field.key) as string) ?? "";
  }

  const configSchema = buildAppConfigSchema(appId);
  const parsed = configSchema.safeParse(config);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return { error: "Validation failed.", fieldErrors };
  }

  const allRequiredFilled = app.configFields
    .filter((f) => f.required)
    .every((f) => config[f.key]?.trim());

  await db
    .update(appInstallations)
    .set({
      config: parsed.data as Record<string, string>,
      status: allRequiredFilled ? "configured" : "installed",
      updatedAt: new Date(),
    })
    .where(and(eq(appInstallations.userId, CURRENT_USER_ID), eq(appInstallations.appId, appId)));

  revalidatePath("/apps");
  return { success: true };
}

export async function uninstallApp(_prevState: unknown, formData: FormData) {
  const parsed = UninstallAppSchema.safeParse({
    appId: formData.get("appId"),
  });

  if (!parsed.success) {
    return { error: "Invalid app ID." };
  }

  await db
    .delete(appInstallations)
    .where(and(eq(appInstallations.userId, CURRENT_USER_ID), eq(appInstallations.appId, parsed.data.appId)));

  revalidatePath("/apps");
  return { success: true };
}
