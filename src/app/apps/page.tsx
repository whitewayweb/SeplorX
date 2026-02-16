export const dynamic = "force-dynamic";

import { db } from "@/db";
import { appInstallations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { appRegistry, getCategories, categoryLabels } from "@/lib/apps";
import type { AppWithStatus } from "@/lib/apps";
import { CategoryTabs } from "@/components/apps/category-tabs";

// TODO: replace with auth() when auth is re-added
const CURRENT_USER_ID = 1;

export default async function AppsPage() {
  const installations = await db
    .select()
    .from(appInstallations)
    .where(eq(appInstallations.userId, CURRENT_USER_ID));

  const installationMap = new Map(
    installations.map((inst) => [inst.appId, inst])
  );

  const appsWithStatus: AppWithStatus[] = appRegistry.map((app) => {
    const inst = installationMap.get(app.id);
    return {
      ...app,
      status: inst ? inst.status : "not_installed",
      installationId: inst?.id,
      config: (inst?.config as Record<string, string>) ?? undefined,
    };
  });

  const categories = getCategories();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Apps</h1>
        <p className="text-muted-foreground mt-2">
          Connect third-party services to extend your shipping workflow.
        </p>
      </div>
      <CategoryTabs
        categories={categories}
        categoryLabels={categoryLabels}
        apps={appsWithStatus}
      />
    </div>
  );
}
