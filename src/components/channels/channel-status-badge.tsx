import { Badge } from "@/components/ui/badge";
import type { ChannelStatus } from "@/lib/channels/types";

interface ChannelStatusBadgeProps {
  status: ChannelStatus;
}

export function ChannelStatusBadge({ status }: ChannelStatusBadgeProps) {
  if (status === "connected") {
    return <Badge variant="default">Connected</Badge>;
  }
  if (status === "pending") {
    return <Badge variant="secondary">Pending</Badge>;
  }
  return <Badge variant="outline">Disconnected</Badge>;
}
