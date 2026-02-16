"use server";

import { db } from "@/db";
import { appInstallations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getAppById } from "@/lib/apps";
import { InstallAppSchema, UninstallAppSchema, buildAppConfigSchema } from "@/lib/validations/apps";
import { encrypt } from "@/lib/crypto";

// TODO: replace with auth() when auth is re-added
const CURRENT_USER_ID = 1;

/** Sentinel value sent by the client when a masked password field was not changed */
const MASKED_SENTINEL = "••••••••";

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

  try {
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
  } catch (err) {
    console.error("installApp error:", err);
    return { error: "Failed to install app. Please try again." };
  }

  revalidatePath("/apps");
  return { success: true };
}

export async function configureApp(_prevState: unknown, formData: FormData) {
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

  try {
    // Verify installation exists before updating
    const existing = await db
      .select({ id: appInstallations.id, config: appInstallations.config })
      .from(appInstallations)
      .where(and(eq(appInstallations.userId, CURRENT_USER_ID), eq(appInstallations.appId, appId)))
      .limit(1);

    if (existing.length === 0) {
      return { error: "App is not installed." };
    }

    const existingConfig = (existing[0].config as Record<string, string>) ?? {};

    // Build config from form data, keeping existing encrypted values for unchanged masked fields
    const config: Record<string, string> = {};
    for (const field of app.configFields) {
      const formValue = (formData.get(field.key) as string) ?? "";

      if (field.type === "password" && formValue === MASKED_SENTINEL) {
        // User didn't change this field — keep the existing encrypted value
        config[field.key] = existingConfig[field.key] ?? "";
      } else {
        config[field.key] = formValue;
      }
    }

    // Validate the plain-text values (before encryption)
    const configSchema = buildAppConfigSchema(appId);
    const parsed = configSchema.safeParse(config);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      return { error: "Validation failed.", fieldErrors };
    }

    // Encrypt sensitive fields (type === "password") before storing
    const encryptedConfig: Record<string, string> = {};
    for (const field of app.configFields) {
      const value = (parsed.data as Record<string, string>)[field.key] ?? "";
      if (field.type === "password" && value) {
        // Only re-encrypt if the value changed (not the existing encrypted value)
        if (field.type === "password" && config[field.key] === existingConfig[field.key]) {
          encryptedConfig[field.key] = value; // already encrypted, keep as-is
        } else {
          encryptedConfig[field.key] = encrypt(value);
        }
      } else {
        encryptedConfig[field.key] = value;
      }
    }

    const allRequiredFilled = app.configFields
      .filter((f) => f.required)
      .every((f) => encryptedConfig[f.key]?.trim());

    await db
      .update(appInstallations)
      .set({
        config: encryptedConfig,
        status: allRequiredFilled ? "configured" : "installed",
        updatedAt: new Date(),
      })
      .where(and(eq(appInstallations.userId, CURRENT_USER_ID), eq(appInstallations.appId, appId)));
  } catch (err) {
    console.error("configureApp error:", err);
    return { error: "Failed to save configuration. Please try again." };
  }

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

  const { appId } = parsed.data;

  try {
    // Verify installation exists before deleting
    const existing = await db
      .select({ id: appInstallations.id })
      .from(appInstallations)
      .where(and(eq(appInstallations.userId, CURRENT_USER_ID), eq(appInstallations.appId, appId)))
      .limit(1);

    if (existing.length === 0) {
      return { error: "App is not installed." };
    }

    await db
      .delete(appInstallations)
      .where(and(eq(appInstallations.userId, CURRENT_USER_ID), eq(appInstallations.appId, appId)));
  } catch (err) {
    console.error("uninstallApp error:", err);
    return { error: "Failed to uninstall app. Please try again." };
  }

  revalidatePath("/apps");
  return { success: true };
}
