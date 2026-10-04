import type { ReactNode } from "react";
import type { ModuleKey } from "@nuro7/contracts";
import { ModuleHeader } from "@/components/layout/module-header";

interface DashboardLayoutProps {
  module?: ModuleKey;
  title: string;
  description: string;
  children: ReactNode;
}

export function DashboardLayout({ module = "dashboard", title, description, children }: DashboardLayoutProps) {
  return (
    <div className="space-y-8">
      <ModuleHeader module={module} title={title} description={description} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">{children}</div>
    </div>
  );
}
