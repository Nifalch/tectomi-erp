"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeAttendance } from "@/lib/api/employee-profile";

interface AttendanceRow {
  id?: string;
  date: string;
  // Backend fields are `checkIn` / `checkOut` (see Prisma Attendance model).
  // The previous tab read `clockIn` / `clockOut` which always resolved to
  // undefined → "—". Map to the right names here.
  checkIn?: string | null;
  checkOut?: string | null;
  totalHours?: number | string | null;
  status?: "PRESENT" | "LATE" | "HALF_DAY" | "ABSENT" | "ON_LEAVE" | "HOLIDAY";
  lateMinutes?: number;
}

function StatusBadge({ status, lateMinutes }: { status?: AttendanceRow["status"]; lateMinutes?: number }) {
  if (!status) return <Badge size="sm" tone="neutral">—</Badge>;
  switch (status) {
    case "PRESENT":
      return <Badge size="sm" tone="positive">On time</Badge>;
    case "LATE":
      return <Badge size="sm" tone="warning">Late{lateMinutes ? ` · ${lateMinutes}m` : ""}</Badge>;
    case "HALF_DAY":
      return <Badge size="sm" tone="destructive">Half-day</Badge>;
    case "ABSENT":
      return <Badge size="sm" tone="destructive">Absent</Badge>;
    case "ON_LEAVE":
      return <Badge size="sm" tone="info">On leave</Badge>;
    case "HOLIDAY":
      return <Badge size="sm" tone="neutral">Holiday</Badge>;
    default:
      return <Badge size="sm" tone="neutral">{status}</Badge>;
  }
}

export function AttendanceTab({ userId }: { userId: string }) {
  const q = useEmployeeAttendance(userId);
  if (q.isLoading) return <LoadingState label="Loading attendance..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load attendance." />;

  const records = (q.data.records ?? []) as unknown as AttendanceRow[];
  if (records.length === 0) return <Card className="text-sm text-slate-500">No attendance records.</Card>;

  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Check in</th>
            <th className="px-4 py-2">Check out</th>
            <th className="px-4 py-2 text-right">Hours</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={r.id ?? i} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
              <td className="px-4 py-2">{new Date(r.date).toLocaleDateString()}</td>
              <td className="px-4 py-2"><StatusBadge status={r.status} lateMinutes={r.lateMinutes} /></td>
              <td className="px-4 py-2 tabular-nums">
                {r.checkIn ? new Date(r.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
              </td>
              <td className="px-4 py-2 tabular-nums">
                {r.checkOut ? new Date(r.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {r.totalHours != null ? `${Number(r.totalHours).toFixed(1)}h` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
