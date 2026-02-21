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
    return (
      <Badge
        variant="secondary"
        className="border-yellow-300 bg-yellow-50 text-yellow-800"
        title="OAuth setup was not completed. Click 'Complete Setup' to finish connecting."
      >
        Setup Incomplete
      </Badge>
    );
  }
  return <Badge variant="outline">Disconnected</Badge>;
}
