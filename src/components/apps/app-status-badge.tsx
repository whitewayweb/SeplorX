import { Badge } from "@/components/ui/badge";
import type { AppStatus } from "@/lib/apps";

const statusConfig: Record<AppStatus, { label: string; variant: "outline" | "secondary" | "default" }> = {
  not_installed: { label: "Not Installed", variant: "outline" },
  installed: { label: "Installed", variant: "secondary" },
  configured: { label: "Configured", variant: "default" },
};

export function AppStatusBadge({ status }: { status: AppStatus }) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
