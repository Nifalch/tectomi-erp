"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { HubAlert } from "@/lib/api/hr-hub";

const TONE: Record<HubAlert["severity"], "info" | "warning" | "destructive"> = {
  info: "info",
  warning: "warning",
  destructive: "destructive",
};

export function AlertsPanel({ alerts }: { alerts: HubAlert[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Alerts ({alerts.length})</h3>
      {alerts.length === 0 ? (
        <p className="text-sm text-slate-500">No active alerts.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800"
            >
              <div>
                <Link
                  href={`/hr/employees/${a.userId}`}
                  className="text-sm font-medium text-slate-900 hover:text-blue-600 hover:underline dark:text-white"
                >
                  {a.userName}
                </Link>
                <div className="text-xs text-slate-500">{a.detail}</div>
              </div>
              <Badge tone={TONE[a.severity]} size="sm">
                {a.kind.replace(/_/g, " ").toLowerCase()}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
