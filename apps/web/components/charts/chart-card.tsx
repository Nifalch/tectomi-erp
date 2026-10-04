"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function ChartCard({ title, description, action, icon, className, children }: ChartCardProps) {
  return (
    <Card className={cn("flex flex-col gap-4", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {icon && <div className="mt-0.5 text-slate-400">{icon}</div>}
            <div>
              {title && <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h3>}
              {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </Card>
  );
}
