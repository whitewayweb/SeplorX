import { Badge } from "@/components/ui/badge";

const typeLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  supplier: { label: "Supplier", variant: "default" },
  customer: { label: "Customer", variant: "secondary" },
  both: { label: "Supplier & Customer", variant: "outline" },
};

interface CompanyTypeBadgeProps {
  type: string;
}

export function CompanyTypeBadge({ type }: CompanyTypeBadgeProps) {
  const config = typeLabels[type] ?? { label: type, variant: "outline" as const };

  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}
