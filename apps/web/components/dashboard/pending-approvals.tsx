import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Receipt, FileText } from "lucide-react";

interface PendingItem {
  label: string;
  count: number;
  icon: typeof CalendarClock;
  tone: "warning" | "destructive" | "info";
}

export function PendingApprovals({ metrics }: { metrics: Record<string, number> }) {
  const items: PendingItem[] = [
    { label: "Leave Requests", count: 0, icon: CalendarClock, tone: "warning" },
    { label: "Pending Invoices", count: Number(metrics.pendingInvoices ?? 0), icon: Receipt, tone: "destructive" },
    { label: "Draft Proposals", count: 0, icon: FileText, tone: "info" },
  ];

  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Pending Actions</CardTitle>
        {total > 0 && <Badge tone="warning" count={total} />}
      </div>
      <div className="mt-4 space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2.5">
                <Icon className="size-4 text-slate-400" />
                <span>{item.label}</span>
              </div>
              <Badge tone={item.count > 0 ? item.tone : "neutral"} size="sm">{item.count}</Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
