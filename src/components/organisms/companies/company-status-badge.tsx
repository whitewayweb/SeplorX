import { Badge } from "@/components/ui/badge";

interface CompanyStatusBadgeProps {
  isActive: boolean;
}

export function CompanyStatusBadge({ isActive }: CompanyStatusBadgeProps) {
  return (
    <Badge variant={isActive ? "default" : "secondary"}>
      {isActive ? "Active" : "Inactive"}
    </Badge>
  );
}
