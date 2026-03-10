import type { AppWithStatus } from "@/lib/apps";
import { AppCard } from "./app-card";

export function AppGrid({ apps }: { apps: AppWithStatus[] }) {
  if (apps.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center">
        No apps available in this category yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
      {apps.map((app) => (
        <AppCard key={app.id} app={app} />
      ))}
    </div>
  );
}
