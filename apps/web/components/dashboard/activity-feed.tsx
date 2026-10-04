"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { useActivityLogs } from "@/lib/api/hooks";
import { toArray } from "@/lib/utils";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const actionLabels: Record<string, string> = {
  CREATED: "created",
  UPDATED: "updated",
  DELETED: "deleted",
  ASSIGNED: "assigned",
  STATUS_CHANGED: "changed status of",
  COMMENTED: "commented on",
  APPROVED: "approved",
  REJECTED: "rejected",
  UPLOADED: "uploaded",
  SENT: "sent",
  LOGGED_IN: "logged in",
};

const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#06b6d4"];

export function ActivityFeed() {
  const { data } = useActivityLogs();
  const logs = toArray<{
    id: string;
    action: string;
    entityType: string;
    entityName?: string;
    user: { firstName: string; lastName: string };
    createdAt: string;
  }>(data);

  const recentLogs = logs.slice(0, 6);

  return (
    <Card>
      <CardTitle>Recent Activity</CardTitle>
      <div className="mt-4 space-y-3">
        {recentLogs.length === 0 ? (
          <p className="text-sm text-slate-400">No recent activity. Actions will appear here as your team works.</p>
        ) : (
          recentLogs.map((log, i) => {
            const initials = `${log.user.firstName[0]}${log.user.lastName[0]}`;
            const color = colors[i % colors.length];
            const verb = actionLabels[log.action] ?? log.action.toLowerCase();
            const entity = log.entityName ? `"${log.entityName}"` : log.entityType.toLowerCase();
            return (
              <div key={log.id} className="flex items-start gap-3 text-sm">
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-slate-700 dark:text-slate-300">
                    {log.user.firstName} {verb} {entity}
                  </span>
                  <span className="ml-2 text-xs text-slate-400">{timeAgo(log.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
