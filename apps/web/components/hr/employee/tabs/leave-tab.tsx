"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeLeave } from "@/lib/api/employee-profile";
import { useLeaveMonthlyUsage } from "@/lib/api/hooks";

interface LeaveBalance {
  id: string;
  leaveType: string;
  // Prisma LeaveBalance exposes totalDays / usedDays / remaining (all
  // Decimal serialized to string|number) — the previous version of this
  // tab read a non-existent `balance` field, so every card showed blank.
  totalDays?: number | string;
  usedDays?: number | string;
  remaining?: number | string;
}

interface LeaveRequest {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  reason?: string | null;
  isHalfDay?: boolean;
  days?: number | string;
  source?: "REQUESTED" | "AUTO_HALF_DAY" | "AUTO_LATE_PENALTY";
  isPaid?: boolean;
}

function fmtNum(v: number | string | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function sourceLabel(s?: LeaveRequest["source"]): string {
  if (s === "AUTO_HALF_DAY") return "Auto · half-day";
  if (s === "AUTO_LATE_PENALTY") return "Auto · late penalty";
  return "Requested";
}

export function LeaveTab({ userId }: { userId: string }) {
  const q = useEmployeeLeave(userId);
  const monthlyQ = useLeaveMonthlyUsage(userId);
  if (q.isLoading) return <LoadingState label="Loading leave..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load leave data." />;

  const balances = (q.data.balances ?? []) as unknown as LeaveBalance[];
  const requests = (q.data.requests ?? []) as unknown as LeaveRequest[];
  const monthly = monthlyQ.data;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h3 className="mb-3 font-semibold">Balances</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {/* Monthly paid-leave card — always present even when LeaveBalance
              rows are missing, so HR can see the cap counter for any user. */}
          {monthly && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
              <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                Paid · this month
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {monthly.remaining}
                <span className="ml-1 text-xs font-normal text-slate-500">/ {monthly.cap}</span>
              </div>
              <div className="text-[11px] text-slate-500">{monthly.used} used</div>
            </div>
          )}
          {balances.length === 0 && !monthly ? (
            <p className="col-span-full text-sm text-slate-500">No balance records.</p>
          ) : (
            balances.map((b) => (
              <div key={b.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-xs uppercase tracking-wider text-slate-400">{b.leaveType}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{fmtNum(b.remaining)}</div>
                <div className="text-[11px] text-slate-500">
                  {fmtNum(b.usedDays)} used · {fmtNum(b.totalDays)} total
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">Requests</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-slate-500">No leave requests.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((r) => {
              const start = new Date(r.startDate).toLocaleDateString();
              const end = new Date(r.endDate).toLocaleDateString();
              const range = start === end ? start : `${start} → ${end}`;
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      <span>{r.leaveType}</span>
                      {r.isHalfDay && <Badge tone="info" size="sm">Half</Badge>}
                      <Badge tone={r.isPaid === false ? "destructive" : "positive"} size="sm">
                        {r.isPaid === false ? "Unpaid" : "Paid"}
                      </Badge>
                      <Badge
                        tone={r.source && r.source !== "REQUESTED" ? "destructive" : "neutral"}
                        size="sm"
                      >
                        {sourceLabel(r.source)}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500">
                      {range} · {fmtNum(r.days)} day{r.days != null && Number(r.days) === 1 ? "" : "s"}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </div>
                  </div>
                  <Badge
                    tone={r.status === "APPROVED" ? "positive" : r.status === "REJECTED" ? "destructive" : "warning"}
                    size="sm"
                  >
                    {r.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
