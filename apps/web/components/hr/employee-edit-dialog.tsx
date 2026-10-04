"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useUpdateEmployee } from "@/lib/api/mutations";
import { useUsers } from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/store/auth-store";
import { formatCurrency } from "@/lib/utils";

const FINANCE_ROLES = ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER", "HR_MANAGER"];
// Founder is a structural designation, not a finance attribute — gated to
// SUPER_ADMIN / ADMIN. HR / Finance can edit pay but can't unilaterally
// strip co-founder status.
const FOUNDER_TOGGLE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export interface EmployeeEditTarget {
  userId: string;
  name: string;
  department?: string;
  designation?: string;
  employmentType?: string;
  salary?: number | null;
  hourlyRate?: number | null;
  isFounder?: boolean;
  shiftStartHour?: number | null;
  shiftStartMinute?: number | null;
  shiftEndHour?: number | null;
  shiftEndMinute?: number | null;
  requiredDailyHours?: number | null;
  managerId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: EmployeeEditTarget | null;
}

export function EmployeeEditDialog({ open, onOpenChange, employee }: Props) {
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canEditRate = roles.some((r) => FINANCE_ROLES.includes(r));
  const canToggleFounder = roles.some((r) => FOUNDER_TOGGLE_ROLES.includes(r));

  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [employmentType, setEmploymentType] = useState("FULL_TIME");
  const [salary, setSalary] = useState<number | null>(null);
  const [hourlyRate, setHourlyRate] = useState<number | null>(null);
  const [isFounder, setIsFounder] = useState(false);
  // Per-employee shift override — null means "use org default". We model
  // the start time as an HH:MM string to match <input type="time">. The end
  // time is now computed from start + dailyHours (no separate field) but
  // we keep the raw shiftEnd in case HR wants an explicit override later.
  const [shiftStartStr, setShiftStartStr] = useState<string>("");
  const [shiftEndStr, setShiftEndStr] = useState<string>("");
  // Optional per-employee daily-hours override. Empty string = inherit org
  // default (org's AttendancePolicy.requiredDailyHours, usually 8).
  const [dailyHoursStr, setDailyHoursStr] = useState<string>("");
  const [managerId, setManagerId] = useState<string>("");

  useEffect(() => {
    if (!employee) return;
    setDepartment(employee.department ?? "");
    setDesignation(employee.designation ?? "");
    setEmploymentType(employee.employmentType ?? "FULL_TIME");
    setSalary(employee.salary ?? null);
    setHourlyRate(employee.hourlyRate ?? null);
    setIsFounder(!!employee.isFounder);
    setShiftStartStr(
      employee.shiftStartHour != null
        ? `${pad2(employee.shiftStartHour)}:${pad2(employee.shiftStartMinute ?? 0)}`
        : "",
    );
    setShiftEndStr(
      employee.shiftEndHour != null
        ? `${pad2(employee.shiftEndHour)}:${pad2(employee.shiftEndMinute ?? 0)}`
        : "",
    );
    setDailyHoursStr(employee.requiredDailyHours != null ? String(employee.requiredDailyHours) : "");
    setManagerId(employee.managerId ?? "");
    // Key the effect on the target user's id, NOT the editTarget object
    // identity. The parent recreates editTarget on every render, so a
    // `[employee]` dep would reset the form mid-edit on any unrelated
    // parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.userId]);

  const mutation = useUpdateEmployee(employee?.userId ?? "");
  // Pull the full active-user list so HR can pick anyone as a manager.
  // The picker filters out the employee themselves to prevent self-reports
  // (the server also enforces this, but the UI saves you a round-trip).
  const usersQuery = useUsers({ includeInactive: false });
  type DirectoryUser = { id: string; firstName?: string; lastName?: string; email?: string };
  const allUsers = (usersQuery.data?.data ?? []) as DirectoryUser[];
  const managerOptions = [
    { value: "", label: "— No manager (root of org chart) —" },
    ...allUsers
      .filter((u) => u.id !== employee?.userId)
      .map((u) => ({
        value: u.id,
        label: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || (u.email ?? u.id),
      })),
  ];

  const submit = () => {
    if (!employee) return;
    const payload: Record<string, unknown> = {
      department,
      designation,
      employmentType,
      salary: salary ?? undefined,
    };
    if (canEditRate) {
      payload.hourlyRate = hourlyRate ?? 0;
    }
    if (canToggleFounder) {
      payload.isFounder = isFounder;
    }
    // Shift overrides: send explicit null when cleared so the API resets
    // to the org default. An empty string from the time input means
    // "no override".
    const startParts = parseHHMM(shiftStartStr);
    const endParts = parseHHMM(shiftEndStr);
    payload.shiftStartHour = startParts?.hour ?? null;
    payload.shiftStartMinute = startParts?.minute ?? null;
    payload.shiftEndHour = endParts?.hour ?? null;
    payload.shiftEndMinute = endParts?.minute ?? null;
    const dh = dailyHoursStr.trim() === "" ? null : Number(dailyHoursStr);
    payload.requiredDailyHours = dh != null && !Number.isNaN(dh) ? dh : null;
    // Empty string clears the reporting line — sent as null so the API
    // unsets the FK rather than failing on an unknown manager id.
    payload.managerId = managerId === "" ? null : managerId;
    mutation.mutate(payload, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Edit employee</DialogTitle>
          <DialogDescription>{employee?.name}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Department</label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Designation</label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Employment type</label>
            <Select
              value={employmentType}
              onValueChange={setEmploymentType}
              options={[
                { value: "FULL_TIME", label: "Full time" },
                { value: "PART_TIME", label: "Part time" },
                { value: "CONTRACT", label: "Contract" },
                { value: "INTERN", label: "Intern" },
              ]}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Reports to (manager)
            </label>
            <Select
              value={managerId}
              onValueChange={setManagerId}
              options={managerOptions}
              placeholder="Choose a manager"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Sets where this employee appears in the org chart. Leave empty to keep them as a top-level root.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Salary</label>
              <NumberInput value={salary} onChange={setSalary} placeholder="0" />
            </div>

            {canEditRate && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Hourly rate</label>
                {employee?.hourlyRate != null && (
                  <p className="mb-1 text-[11px] text-slate-400">
                    Current: {formatCurrency(Number(employee.hourlyRate))}/hr
                  </p>
                )}
                <NumberInput
                  value={hourlyRate}
                  onChange={setHourlyRate}
                  placeholder="0.00"
                  suffix="/hr"
                />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-slate-50/60 p-3 dark:bg-slate-900/40">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="text-sm font-medium">Working hours</div>
              <span className="text-[11px] text-slate-400">leave blank to use org default</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Start time</label>
                <input
                  type="time"
                  value={shiftStartStr}
                  onChange={(e) => setShiftStartStr(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus:border-primary dark:bg-slate-950/60"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Hours per day
                  <span className="ml-1 font-normal text-slate-400">(optional override)</span>
                </label>
                <input
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={dailyHoursStr}
                  onChange={(e) => setDailyHoursStr(e.target.value)}
                  placeholder="inherits org default (8)"
                  className="h-11 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus:border-primary dark:bg-slate-950/60"
                />
              </div>
            </div>
            {shiftStartStr && (
              <p className="mt-2 rounded-lg bg-white px-3 py-2 text-[11px] text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                Starts <span className="font-mono font-semibold">{shiftStartStr}</span>
                {" · "}
                works <span className="font-semibold">{dailyHoursStr || "8"}</span>h
                {" · "}
                expected check-out{" "}
                <span className="font-mono font-semibold">
                  {addHoursToTime(shiftStartStr, Number(dailyHoursStr) || 8)}
                </span>
              </p>
            )}
            <details className="mt-2 text-[11px]">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                Advanced — pin a fixed end time
              </summary>
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">End time</label>
                <input
                  type="time"
                  value={shiftEndStr}
                  onChange={(e) => setShiftEndStr(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus:border-primary dark:bg-slate-950/60"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Use when this employee has a hard fixed end time regardless of start. Leave blank to auto-compute from start + hours.
                </p>
              </div>
            </details>
            <p className="mt-2 text-[11px] text-slate-500">
              24-hour clock. Most employees: just set the start time and required hours — the end auto-shifts.
            </p>
            {(shiftStartStr || shiftEndStr || dailyHoursStr) && (
              <button
                type="button"
                onClick={() => {
                  setShiftStartStr("");
                  setShiftEndStr("");
                  setDailyHoursStr("");
                }}
                className="mt-2 text-[11px] font-medium text-primary hover:underline"
              >
                Clear override (use org default)
              </button>
            )}
          </div>

          {canToggleFounder && (
            <label className="flex items-start gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2 dark:bg-slate-900">
              <input
                type="checkbox"
                checked={isFounder}
                onChange={(e) => setIsFounder(e.target.checked)}
                className="mt-0.5 size-4 rounded border-slate-300"
              />
              <div className="text-sm">
                <div className="font-medium">Co-founder</div>
                <p className="text-xs text-slate-500">
                  Unlocks the deferred-compensation editor on their pay slips.
                  Use it for founders who occasionally take less than their
                  agreed salary so the company can track the running IOU.
                </p>
              </div>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseHHMM(value: string): { hour: number; minute: number } | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function addHoursToTime(time: string, hours: number): string {
  const parts = parseHHMM(time);
  if (!parts) return "—";
  const safeHours = !Number.isFinite(hours) || hours <= 0 ? 8 : hours;
  const total = Math.min(23 * 60 + 59, parts.hour * 60 + parts.minute + Math.round(safeHours * 60));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}
