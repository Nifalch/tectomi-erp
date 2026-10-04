"use client";

import { useRouter } from "next/navigation";
import { Plus, FolderKanban, BriefcaseBusiness, Receipt, CalendarCheck2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";

interface QuickAction {
  label: string;
  icon: typeof Plus;
  href: string;
  color: string;
}

const actions: QuickAction[] = [
  { label: "New Project", icon: FolderKanban, href: "/projects", color: "#8b5cf6" },
  { label: "New Task", icon: BriefcaseBusiness, href: "/tasks", color: "#f59e0b" },
  { label: "New Invoice", icon: Receipt, href: "/invoices", color: "#10b981" },
  { label: "Clock In", icon: CalendarCheck2, href: "/attendance", color: "#14b8a6" },
];

export function QuickActions() {
  const router = useRouter();

  return (
    <Card>
      <CardTitle>Quick Actions</CardTitle>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={() => router.push(action.href)}
              className="flex items-center gap-2.5 rounded-xl border border-border/50 px-3 py-2.5 text-sm font-medium transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <Icon className="size-4" style={{ color: action.color }} />
              {action.label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
