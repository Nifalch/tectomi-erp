"use client";

import { useState, type ReactNode } from "react";
import type { ModuleKey, PermissionKey } from "@nuro7/contracts";
import { ModuleHeader } from "@/components/layout/module-header";
import { Tabs } from "@/components/ui/tabs";
import type { BreadcrumbItem } from "@/components/ui/breadcrumbs";

interface TabConfig {
  key: string;
  label: string;
  content: ReactNode;
  count?: number;
}

interface DetailPageLayoutProps {
  module: ModuleKey;
  title: string;
  description?: string;
  breadcrumbs: BreadcrumbItem[];
  tabs?: TabConfig[];
  actions?: Array<{
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    permission?: PermissionKey;
  }>;
  children?: ReactNode;
}

export function DetailPageLayout({
  module,
  title,
  description = "",
  breadcrumbs,
  tabs,
  actions,
  children,
}: DetailPageLayoutProps) {
  const [activeTab, setActiveTab] = useState(tabs?.[0]?.key ?? "");

  const activeContent = tabs?.find((t) => t.key === activeTab)?.content;

  return (
    <div className="space-y-6">
      <ModuleHeader
        module={module}
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        secondaryActions={actions}
      />

      {tabs && tabs.length > 0 && (
        <>
          <Tabs
            tabs={tabs.map((t) => ({ key: t.key, label: t.label, count: t.count }))}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
          <div>{activeContent}</div>
        </>
      )}

      {!tabs && children}
    </div>
  );
}
