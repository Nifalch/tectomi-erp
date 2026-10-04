"use client";

import type { ReactNode } from "react";
import { MODULE_META, type ModuleKey, type PermissionKey } from "@nuro7/contracts";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/lib/hooks/use-permission";
import { cn } from "@/lib/utils";

interface ActionConfig {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  permission?: PermissionKey;
}

interface CountBadge {
  label: string;
  value: number;
  tone?: "neutral" | "positive" | "warning" | "destructive" | "info";
}

interface ModuleHeaderProps {
  module: ModuleKey;
  title: string;
  description: string;
  primaryAction?: ActionConfig;
  secondaryActions?: ActionConfig[];
  breadcrumbs?: BreadcrumbItem[];
  counts?: CountBadge[];
}

function PermissionGate({ permission, children }: { permission?: PermissionKey; children: ReactNode }) {
  const allowed = usePermission(permission ?? ("" as PermissionKey));
  if (permission && !allowed) return null;
  return <>{children}</>;
}

export function ModuleHeader({
  module,
  title,
  description,
  primaryAction,
  secondaryActions,
  breadcrumbs,
  counts,
}: ModuleHeaderProps) {
  const meta = MODULE_META[module];

  return (
    <div className="space-y-3">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: meta?.hex }} />
            <p className="text-xs uppercase tracking-[0.26em] text-slate-400">{meta?.label ?? module}</p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 sm:mt-2">{description}</p>

          {counts && counts.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:mt-3 sm:gap-2">
              {counts.map((c) => (
                <Badge key={c.label} tone={c.tone ?? "neutral"} size="sm">
                  {c.value} {c.label}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {(primaryAction || secondaryActions) && (
          <div className="flex flex-wrap items-center gap-2">
            {secondaryActions?.map((action) => (
              <PermissionGate key={action.label} permission={action.permission}>
                <Button variant="secondary" size="sm" onClick={action.onClick}>
                  {action.icon}
                  <span className="hidden sm:inline">{action.label}</span>
                </Button>
              </PermissionGate>
            ))}
            {primaryAction && (
              <PermissionGate permission={primaryAction.permission}>
                <Button
                  size="sm"
                  onClick={primaryAction.onClick}
                  className={cn("text-white")}
                  style={{ backgroundColor: meta?.hex }}
                >
                  {primaryAction.icon}
                  {primaryAction.label}
                </Button>
              </PermissionGate>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
