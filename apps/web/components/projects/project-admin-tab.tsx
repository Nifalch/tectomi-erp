"use client";

import { useState } from "react";
import { ProjectSettingsTab } from "@/components/projects/project-settings-tab";
import { ProjectLabelsTab } from "@/components/projects/project-labels-tab";
import { ProjectRecurringTab } from "@/components/projects/project-recurring-tab";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "settings", label: "Project settings" },
  { key: "labels", label: "Labels" },
  { key: "recurring", label: "Recurring tasks" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

/**
 * Consolidated "Settings" tab that folds three admin-style features
 * (project metadata, label management, recurring task templates) into
 * one tab so the top-level tab bar can stay compact.
 *
 * The three sections are switched via a pill toggle so each surface
 * keeps its own deep-link-ish state without an actual route change.
 */
export function ProjectAdminTab({ projectId }: { projectId: string }) {
  const [active, setActive] = useState<SectionKey>("settings");

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition",
              active === s.key
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div>
        {active === "settings" && <ProjectSettingsTab projectId={projectId} />}
        {active === "labels" && <ProjectLabelsTab projectId={projectId} />}
        {active === "recurring" && <ProjectRecurringTab projectId={projectId} />}
      </div>
    </div>
  );
}
