"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

const ALL_TABS: Array<{ key: string; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "attendance", label: "Attendance" },
  { key: "leave", label: "Leave" },
  { key: "performance", label: "Performance" },
  { key: "payroll", label: "Payroll" },
  { key: "career", label: "Career" },
  { key: "projects", label: "Projects" },
  { key: "documents", label: "Documents" },
  { key: "assets", label: "Assets" },
  { key: "onboarding", label: "Onboarding" },
  { key: "timeline", label: "Timeline" },
  { key: "notes", label: "Notes" },
  { key: "access", label: "Access" },
];

interface Props {
  activeTab: string;
  accessibleTabs: string[];
}

export function EmployeeTabBar({ activeTab, accessibleTabs }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const visibleTabs = ALL_TABS.filter((t) => accessibleTabs.includes(t.key));

  const switchTab = useCallback(
    (key: string) => {
      const sp = new URLSearchParams(params.toString());
      sp.set("tab", key);
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [params, pathname, router],
  );

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
      {visibleTabs.map((t) => (
        <button
          key={t.key}
          onClick={() => switchTab(t.key)}
          className={cn(
            "whitespace-nowrap px-4 py-2 text-sm font-medium transition",
            activeTab === t.key
              ? "border-b-2 border-blue-600 text-blue-700 dark:text-blue-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
