"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EmployeeOverview } from "@/lib/api/employee-profile";
import { useResendInvite } from "@/lib/api/employee-profile";
import { useReactivateEmployee } from "@/lib/api/hr-hub";
import { useAuthStore } from "@/lib/store/auth-store";
import { EmployeeEditDialog, type EmployeeEditTarget } from "@/components/hr/employee-edit-dialog";
import { TerminateEmployeeDialog } from "./terminate-employee-dialog";

const HR_ROLES = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"];

interface Props {
  employee: EmployeeOverview;
}

export function EmployeeHeader({ employee }: Props) {
  const viewerRoles = useAuthStore((s) => s.user?.roles ?? []);
  const isHr = viewerRoles.some((r) => HR_ROLES.includes(r));
  const resendInvite = useResendInvite(employee.userId);
  const reactivate = useReactivateEmployee(employee.userId);
  const [termOpen, setTermOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reactivateConfirmOpen, setReactivateConfirmOpen] = useState(false);

  // Auto-open the edit dialog when the user lands here via /hr/employees/:id?edit=1
  // (used by the "Edit" link on the org-chart page). Effect runs once on mount.
  const searchParams = useSearchParams();
  useEffect(() => {
    if (isHr && searchParams?.get("edit") === "1") {
      setEditOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fullName = `${employee.firstName} ${employee.lastName}`.trim();
  const editTarget: EmployeeEditTarget = {
    userId: employee.userId,
    name: `${employee.firstName} ${employee.lastName}`,
    department: employee.department ?? undefined,
    designation: employee.designation ?? undefined,
    employmentType: employee.employmentType ?? undefined,
    salary: employee.salary ?? null,
    hourlyRate: employee.hourlyRate ?? null,
    isFounder: employee.isFounder,
    shiftStartHour: (employee as { shiftStartHour?: number | null }).shiftStartHour ?? null,
    shiftStartMinute: (employee as { shiftStartMinute?: number | null }).shiftStartMinute ?? null,
    shiftEndHour: (employee as { shiftEndHour?: number | null }).shiftEndHour ?? null,
    shiftEndMinute: (employee as { shiftEndMinute?: number | null }).shiftEndMinute ?? null,
    requiredDailyHours: (employee as { requiredDailyHours?: number | null }).requiredDailyHours ?? null,
    managerId: (employee as { managerId?: string | null }).managerId ?? null,
  };
  const initials = `${employee.firstName?.[0] ?? ""}${employee.lastName?.[0] ?? ""}`.toUpperCase() || fullName.slice(0, 2).toUpperCase();
  const tenure = employee.joinDate
    ? `${Math.max(0, Math.round((Date.now() - new Date(employee.joinDate).getTime()) / (1000 * 60 * 60 * 24 * 365)))} yrs`
    : null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/80 p-5 shadow-panel backdrop-blur sm:flex-row sm:items-start">
      <Avatar initials={initials} className="size-16 text-lg" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{fullName}</h1>
          {employee.terminated && (
            <Badge tone="destructive" size="sm">
              Terminated
              {employee.terminatedAt
                ? ` · ${new Date(employee.terminatedAt).toLocaleDateString()}`
                : ""}
            </Badge>
          )}
          {employee.status === "INVITED" && <Badge tone="warning" size="sm">Invited</Badge>}
          {employee.isFounder && <Badge tone="info" size="sm">Founder</Badge>}
        </div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {employee.designation}
          {employee.department ? ` · ${employee.department}` : ""}
          {tenure ? ` · ${tenure}` : ""}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>{employee.email}</span>
          {employee.phone && <span>{employee.phone}</span>}
          {employee.manager && <span>Manager: {employee.manager}</span>}
          {employee.roles.map((r) => (
            <Badge key={r.code} tone="info" size="sm">{r.name}</Badge>
          ))}
        </div>
      </div>
      {isHr && (
        <div className="flex gap-2">
          {employee.status === "INVITED" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => resendInvite.mutate()}
              disabled={resendInvite.isPending}
            >
              Resend invite
            </Button>
          )}
          {!employee.terminated && (
            <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          )}
          {!employee.terminated && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setTermOpen(true)}
            >
              Terminate
            </Button>
          )}
          {employee.terminated && (
            <Button
              size="sm"
              variant="secondary"
              className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
              onClick={() => setReactivateConfirmOpen(true)}
              disabled={reactivate.isPending}
            >
              {reactivate.isPending ? "Reactivating…" : "Reactivate"}
            </Button>
          )}
        </div>
      )}
      <TerminateEmployeeDialog
        userId={employee.userId}
        employeeName={fullName}
        open={termOpen}
        onOpenChange={setTermOpen}
      />
      <EmployeeEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        employee={editOpen ? editTarget : null}
      />
      {/* Inline confirm — keeps the flow lightweight since reactivation
          is fully reversible by re-terminating, unlike termination
          which releases assets. */}
      {reactivateConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setReactivateConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Reactivate {fullName}?</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Their account will be set back to ACTIVE, and they'll be able to log in
              again. Previously released assets are not auto-reassigned — you'll need
              to re-issue them manually if needed.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setReactivateConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={reactivate.isPending}
                onClick={() =>
                  reactivate.mutate(
                    {},
                    { onSuccess: () => setReactivateConfirmOpen(false) },
                  )
                }
              >
                {reactivate.isPending ? "Reactivating…" : "Yes, reactivate"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
