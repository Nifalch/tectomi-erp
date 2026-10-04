"use client";
import { cn } from "@/lib/utils";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  className?: string;
}

/**
 * Compact tab bar. Wraps to a second row on narrow screens instead of
 * introducing horizontal scroll — detail pages with 10+ tabs look ugly
 * when the active tab is scrolled off-screen.
 */
export function Tabs({ tabs, activeTab, onTabChange, className }: TabsProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800",
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition",
            activeTab === tab.key
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
                activeTab === tab.key
                  ? "bg-primary/10 text-primary"
                  : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
