"use client";

import { useState } from "react";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppStatusBadge } from "./app-status-badge";
import { AppConfigDialog } from "./app-config-dialog";
import { AppIcon } from "./app-icon";
import type { AppWithStatus } from "@/lib/apps";

export function AppCard({ app }: { app: AppWithStatus }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const actionLabel =
    app.status === "not_installed"
      ? "Install"
      : app.status === "installed"
        ? "Configure"
        : "Manage";

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <AppIcon name={app.icon} className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">{app.name}</CardTitle>
              <CardDescription className="mt-1 line-clamp-2">
                {app.description}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardFooter className="flex items-center justify-between">
          <AppStatusBadge status={app.status} />
          <Button
            size="sm"
            variant={app.status === "not_installed" ? "default" : "outline"}
            onClick={() => setDialogOpen(true)}
          >
            {actionLabel}
          </Button>
        </CardFooter>
      </Card>
      <AppConfigDialog app={app} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
