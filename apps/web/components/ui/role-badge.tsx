import type { AppRole } from "@nuro7/contracts";
import { Badge } from "./badge";

const roleConfig: Record<AppRole, { label: string; tone: "info" | "positive" | "warning" | "neutral" | "destructive" }> = {
  SUPER_ADMIN: { label: "Super Admin", tone: "destructive" },
  ADMIN: { label: "Admin", tone: "warning" },
  PROJECT_MANAGER: { label: "PM", tone: "info" },
  HR_MANAGER: { label: "HR", tone: "positive" },
  FINANCE_MANAGER: { label: "Finance", tone: "positive" },
  EMPLOYEE: { label: "Employee", tone: "neutral" },
  CLIENT: { label: "Client", tone: "neutral" },
};

interface RoleBadgeProps {
  role: AppRole;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const config = roleConfig[role];
  return (
    <Badge tone={config.tone} size="sm" className={className}>
      {config.label}
    </Badge>
  );
}
