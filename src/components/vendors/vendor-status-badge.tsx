import { Badge } from "@/components/ui/badge";

interface VendorStatusBadgeProps {
  isActive: boolean;
}

export function VendorStatusBadge({ isActive }: VendorStatusBadgeProps) {
  return (
    <Badge variant={isActive ? "default" : "secondary"}>
      {isActive ? "Active" : "Inactive"}
    </Badge>
  );
}
