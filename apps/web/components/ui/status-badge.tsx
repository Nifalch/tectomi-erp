import { STATUS_CONFIG } from "@nuro7/contracts";
import { Badge } from "./badge";

interface StatusBadgeProps {
  status: string;
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({ status, dot, size, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  if (!config) {
    return <Badge tone="neutral" size={size} className={className}>{status}</Badge>;
  }
  return (
    <Badge tone={config.tone} dot={dot} size={size} className={className}>
      {config.label}
    </Badge>
  );
}
