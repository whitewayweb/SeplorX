import { z } from "zod";
import { getAppById } from "@/lib/apps";

export function buildAppConfigSchema(appId: string) {
  const app = getAppById(appId);
  if (!app) return z.object({});

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of app.configFields) {
    if (field.required) {
      shape[field.key] = z.string().trim().min(1, `${field.label} is required`);
    } else {
      shape[field.key] = z.string().trim().optional().or(z.literal(""));
    }
  }

  return z.object(shape);
}

export const InstallAppSchema = z.object({
  appId: z.string().min(1),
});

export const UninstallAppSchema = z.object({
  appId: z.string().min(1),
});
