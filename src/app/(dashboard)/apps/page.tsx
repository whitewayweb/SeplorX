export const dynamic = "force-dynamic";

import { db } from "@/db";
import { appInstallations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { appRegistry, getCategories, categoryLabels } from "@/lib/apps";
import type { AppWithStatus } from "@/lib/apps";
import { CategoryTabs } from "@/components/organisms/apps/category-tabs";
import { getAuthenticatedUserId } from "@/lib/auth";

/** Sentinel shown in UI for password fields that have a stored (encrypted) value */
const MASKED_VALUE = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

export default async function AppsPage() {
  const userId = await getAuthenticatedUserId();

  const installations = await db
    .select({
      id: appInstallations.id,
      appId: appInstallations.appId,
      status: appInstallations.status,
      config: appInstallations.config,
    })
    .from(appInstallations)
    .where(eq(appInstallations.userId, userId));

  const installationMap = new Map(
    installations.map((inst) => [inst.appId, inst])
  );

  const appsWithStatus: AppWithStatus[] = appRegistry.map((app) => {
    const inst = installationMap.get(app.id);
    if (!inst) {
      return { ...app, status: "not_installed" as const };
    }

    // Redact sensitive (password) fields — never send encrypted values to the client.
    // Non-sensitive fields are passed through for pre-filling.
    const rawConfig = (inst.config as Record<string, string>) ?? {};
    const safeConfig: Record<string, string> = {};
    for (const field of app.configFields) {
      const value = rawConfig[field.key] ?? "";
      if (field.type === "password" && value) {
        safeConfig[field.key] = MASKED_VALUE;
      } else {
        safeConfig[field.key] = value;
      }
    }

    return {
      ...app,
      status: inst.status,
      installationId: inst.id,
      config: safeConfig,
    };
  });

  const categories = getCategories();

  return (
    <div className="p-6">
      <PageHeader
        title="Apps"
        description="Connect third-party services to extend your shipping workflow."
        className="mb-6"
      />
      <CategoryTabs
        categories={categories}
        categoryLabels={categoryLabels}
        apps={appsWithStatus}
      />
    </div>
  );
}
