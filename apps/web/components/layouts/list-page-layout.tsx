"use client";

import type { ReactNode } from "react";
import type { ModuleKey, PermissionKey } from "@nuro7/contracts";
import { ModuleHeader } from "@/components/layout/module-header";
import type { BreadcrumbItem } from "@/components/ui/breadcrumbs";

interface ActionConfig {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  permission?: PermissionKey;
}

interface ListPageLayoutProps {
  module: ModuleKey;
  title: string;
  description: string;
  primaryAction?: ActionConfig;
  secondaryActions?: ActionConfig[];
  breadcrumbs?: BreadcrumbItem[];
  counts?: Array<{ label: string; value: number; tone?: "neutral" | "positive" | "warning" | "destructive" | "info" }>;
  children: ReactNode;
}

export function ListPageLayout({
  module,
  title,
  description,
  primaryAction,
  secondaryActions,
  breadcrumbs,
  counts,
  children,
}: ListPageLayoutProps) {
  return (
    <div className="space-y-8">
      <ModuleHeader
        module={module}
        title={title}
        description={description}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        breadcrumbs={breadcrumbs}
        counts={counts}
      />
      {children}
    </div>
  );
}
