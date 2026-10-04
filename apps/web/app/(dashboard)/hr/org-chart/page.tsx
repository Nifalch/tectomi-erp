"use client";

import { Info } from "lucide-react";
import { ModuleHeader } from "@/components/layout/module-header";
import { OrgTree } from "@/components/hr/org-chart/org-tree";
import { useAuthStore } from "@/lib/store/auth-store";

const HR_ROLES = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"];

export default function OrgChartPage() {
  const isHr = useAuthStore((s) => (s.user?.roles ?? []).some((r) => HR_ROLES.includes(r)));

  return (
    <div className="flex flex-col gap-6">
      <ModuleHeader
        module="hr"
        title="Org chart"
        description="Reporting structure across the company."
      />
      {isHr && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div>
            <strong className="font-medium">To edit the chart:</strong> click any employee node, then
            press <span className="rounded bg-white px-1.5 py-0.5 text-xs font-medium text-slate-900 ring-1 ring-blue-200 dark:bg-slate-900 dark:text-white dark:ring-blue-900/60">Edit</span> on their profile.
            Use the <strong className="font-medium">Reports to</strong> field to change their manager — the chart re-renders from those reporting lines.
          </div>
        </div>
      )}
      <OrgTree />
    </div>
  );
}
