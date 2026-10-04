"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { ViewAsSelector } from "@/components/admin/view-as-selector";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import {
  useAllLeaveRequests,
  useLeaveBalances,
  useLeaveMonthlyUsage,
  useLeaveRequests,
  useUsers,
} from "@/lib/api/hooks";
import { useCreateLeaveRequest, useUpdateLeaveStatus } from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { downloadCsv, rowsToCsv } from "@/lib/utils/csv";

const schema = z
  .object({
    leaveType: z.string().min(1, "Leave type is required"),
    startDate: z.date({ error: "Start date is required" }),
    endDate: z.date({ error: "End date is required" }),
    reason: z.string().optional(),
    isHalfDay: z.boolean().optional(),
  })
  .refine(
    (v) =>
      !v.isHalfDay ||
      (v.startDate && v.endDate && v.startDate.toDateString() === v.endDate.toDateString()),
    {
      message: "Half-day leave must be for a single date.",
      path: ["endDate"],
    },
  );

type FormValues = z.infer<typeof schema>;

interface LeaveRow {
  id: string;
  type?: string;
  leaveType?: string;
  startDate: string;
  endDate: string;
  status: string;
  isHalfDay?: boolean;
  days?: number | string;
  source?: "REQUESTED" | "AUTO_HALF_DAY" | "AUTO_LATE_PENALTY";
  isPaid?: boolean;
  reason?: string | null;
  user?: { id?: string; firstName: string; lastName: string };
  userId?: string;
}

const MONTH_OPTS = [
  { value: "", label: "All months" },
  ...["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map(
    (m, i) => ({ value: String(i + 1), label: m }),
  ),
];

function sourceLabel(s?: LeaveRow["source"]): string {
  if (s === "AUTO_HALF_DAY") return "Auto: half-day";
  if (s === "AUTO_LATE_PENALTY") return "Auto: late penalty";
  return "Requested";
}

export default function LeavePage() {
  const role = useAuthStore((s) => s.user?.roles[0] ?? "EMPLOYEE");
  const isManager = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"].includes(role);

  const searchParams = useSearchParams();
  const viewUserId = searchParams.get("userId") ?? undefined;
  const balancesQuery = useLeaveBalances(viewUserId);
  const monthlyUsageQuery = useLeaveMonthlyUsage(viewUserId);
  const selfQuery = useLeaveRequests(viewUserId);
  const allQuery = useAllLeaveRequests(isManager && !viewUserId);
  const usersQuery = useUsers();
  const createMutation = useCreateLeaveRequest();
  const statusMutation = useUpdateLeaveStatus();

  const [createOpen, setCreateOpen] = useState(false);

  // ── Filter state ──
  const now = new Date();
  const [fYear, setFYear] = useState<string>(String(now.getFullYear()));
  const [fMonth, setFMonth] = useState<string>("");
  const [fEmployee, setFEmployee] = useState<string>("");
  const [fType, setFType] = useState<string>("");
  const [fStatus, setFStatus] = useState<string>("");
  const [fSource, setFSource] = useState<string>("");
  const [fPaid, setFPaid] = useState<string>("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { leaveType: "ANNUAL", isHalfDay: false },
  });

  // Mirror startDate → endDate when half-day toggles on, since half-day
  // is always a single-date request.
  const isHalfDay = form.watch("isHalfDay");
  const startDate = form.watch("startDate");
  useEffect(() => {
    if (isHalfDay && startDate) {
      form.setValue("endDate", startDate, { shouldValidate: true });
    }
  }, [isHalfDay, startDate, form]);

  const onSubmit = (values: FormValues) => {
    createMutation.mutate(
      {
        leaveType: values.leaveType,
        startDate: values.startDate.toISOString(),
        endDate: values.endDate.toISOString(),
        reason: values.reason || undefined,
        isHalfDay: values.isHalfDay,
      },
      { onSuccess: () => { setCreateOpen(false); form.reset(); } },
    );
  };

  const requests = isManager && !viewUserId ? allQuery : selfQuery;

  // Derive the year options from the actual data (plus the current year so
  // a fresh deployment with no records still shows something useful).
  const yearOptions = useMemo(() => {
    const set = new Set<string>([String(now.getFullYear())]);
    ((requests.data ?? []) as unknown as LeaveRow[]).forEach((l) => {
      set.add(String(new Date(l.startDate).getFullYear()));
    });
    return [...set].sort((a, b) => Number(b) - Number(a)).map((y) => ({ value: y, label: y }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests.data]);

  const employeeOptions = useMemo(() => {
    const users = (usersQuery.data?.data ?? []) as unknown as Array<{
      id: string; firstName?: string; lastName?: string; email: string;
    }>;
    return [
      { value: "", label: "All employees" },
      ...users.map((u) => ({
        value: u.id,
        label: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
      })),
    ];
  }, [usersQuery.data]);

  if (requests.isLoading || balancesQuery.isLoading) return <LoadingState label="Loading leave data..." />;
  if (requests.isError) return <ErrorState label="Unable to load leave requests." />;

  const balances = (balancesQuery.data ?? []) as unknown as Array<{ leaveType: string; totalDays: number; usedDays: number; remaining: number }>;
  const monthly = monthlyUsageQuery.data as { cap: number; used: number; remaining: number } | undefined;
  const leavesRaw = (requests.data ?? []) as unknown as LeaveRow[];

  // ── Apply filters client-side ──
  const leaves = leavesRaw.filter((l) => {
    const d = new Date(l.startDate);
    if (fYear && String(d.getFullYear()) !== fYear) return false;
    if (fMonth && String(d.getMonth() + 1) !== fMonth) return false;
    const userId = l.user?.id ?? l.userId;
    if (fEmployee && userId !== fEmployee) return false;
    if (fType && (l.leaveType ?? l.type) !== fType) return false;
    if (fStatus && l.status !== fStatus) return false;
    if (fSource && (l.source ?? "REQUESTED") !== fSource) return false;
    if (fPaid === "paid" && l.isPaid === false) return false;
    if (fPaid === "unpaid" && l.isPaid !== false) return false;
    return true;
  });

  const exportCsv = () => {
    const csv = rowsToCsv(leaves, [
      { key: "id", label: "ID" },
      {
        key: "user",
        label: "Employee",
        map: (r) => (r.user ? `${r.user.firstName} ${r.user.lastName}`.trim() : ""),
      },
      { key: "leaveType", label: "Type", map: (r) => r.leaveType ?? r.type ?? "" },
      { key: "startDate", label: "Start", map: (r) => new Date(r.startDate).toISOString().slice(0, 10) },
      { key: "endDate", label: "End", map: (r) => new Date(r.endDate).toISOString().slice(0, 10) },
      { key: "days", label: "Days", map: (r) => (r.days != null ? Number(r.days) : 1) },
      { key: "isHalfDay", label: "HalfDay", map: (r) => (r.isHalfDay ? "yes" : "no") },
      { key: "source", label: "Source", map: (r) => r.source ?? "REQUESTED" },
      { key: "isPaid", label: "Paid", map: (r) => (r.isPaid === false ? "unpaid" : "paid") },
      { key: "status", label: "Status" },
      { key: "reason", label: "Reason", map: (r) => r.reason ?? "" },
    ]);
    downloadCsv(`leave-${fYear || "all"}${fMonth ? `-${fMonth.padStart(2, "0")}` : ""}.csv`, csv);
  };

  return (
    <div className="flex flex-col gap-5">
      <ModuleHeader
        module="leave"
        title="Leave Management"
        description="Submit leave requests, track balances, and manage approvals."
        primaryAction={{
          label: "Request Leave",
          icon: <Plus className="mr-1 size-4" />,
          onClick: () => setCreateOpen(true),
        }}
      />

      <div className="-mt-2 flex justify-end"><ViewAsSelector /></div>

      <Card className="border-l-4 border-l-amber-500">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="font-semibold">Policy:</span> Only the first 2 leaves per calendar month
          are paid. Beyond that, every leave (any type — Annual, Sick, Casual) is logged as
          <span className="font-semibold"> unpaid</span> and reduces the performance score by
          0.1 per day.
        </p>
      </Card>

      <section className="grid gap-4 md:grid-cols-4">
        {monthly && (
          <Card className="border-l-4 border-l-indigo-500">
            <div className="text-xs uppercase tracking-wider text-slate-400">Paid leaves · this month</div>
            <div className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">
              {monthly.remaining}
              <span className="ml-1 text-sm font-normal text-slate-400">/ {monthly.cap}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">{monthly.used} used · resets month-end</div>
          </Card>
        )}
        {balances.map((b) => (
          <Card key={b.leaveType}>
            <div className="text-xs uppercase tracking-wider text-slate-400">{b.leaveType}</div>
            <div className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{b.remaining}</div>
            <div className="mt-1 text-xs text-slate-500">{b.usedDays} used of {b.totalDays} days</div>
          </Card>
        ))}
      </section>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <CardTitle>Leave Requests</CardTitle>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{leaves.length} of {leavesRaw.length}</span>
            <Button size="sm" variant="secondary" onClick={exportCsv} disabled={leaves.length === 0}>
              <Download className="mr-1 size-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filter toolbar — wraps gracefully on narrow screens. */}
        <div className="mb-3 grid gap-2 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Year</label>
            <Select value={fYear} onValueChange={setFYear} options={[{ value: "", label: "All years" }, ...yearOptions]} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Month</label>
            <Select value={fMonth} onValueChange={setFMonth} options={MONTH_OPTS} />
          </div>
          {isManager && !viewUserId && (
            <div className="lg:col-span-2 xl:col-span-1">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Employee</label>
              <Select value={fEmployee} onValueChange={setFEmployee} options={employeeOptions} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Type</label>
            <Select
              value={fType}
              onValueChange={setFType}
              options={[
                { value: "", label: "All types" },
                { value: "ANNUAL", label: "Annual" },
                { value: "SICK", label: "Sick" },
                { value: "CASUAL", label: "Casual" },
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</label>
            <Select
              value={fStatus}
              onValueChange={setFStatus}
              options={[
                { value: "", label: "All" },
                { value: "PENDING", label: "Pending" },
                { value: "APPROVED", label: "Approved" },
                { value: "REJECTED", label: "Rejected" },
                { value: "CANCELLED", label: "Cancelled" },
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Source</label>
            <Select
              value={fSource}
              onValueChange={setFSource}
              options={[
                { value: "", label: "All" },
                { value: "REQUESTED", label: "Requested" },
                { value: "AUTO_HALF_DAY", label: "Auto half-day" },
                { value: "AUTO_LATE_PENALTY", label: "Auto late" },
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Paid</label>
            <Select
              value={fPaid}
              onValueChange={setFPaid}
              options={[
                { value: "", label: "Paid + Unpaid" },
                { value: "paid", label: "Paid only" },
                { value: "unpaid", label: "Unpaid only" },
              ]}
            />
          </div>
        </div>

        <Table>
          <THead>
            <tr>
              {isManager && <TH>Employee</TH>}
              <TH>Type</TH>
              <TH>Range</TH>
              <TH>Days</TH>
              <TH>Source</TH>
              <TH>Paid</TH>
              <TH>Status</TH>
              {isManager && <TH>Actions</TH>}
            </tr>
          </THead>
          <TBody>
            {leaves.length === 0 ? (
              <tr><td colSpan={isManager ? 8 : 7} className="py-8 text-center text-sm text-slate-400">No leave requests match the current filters.</td></tr>
            ) : (
              leaves.map((l) => {
                const start = new Date(l.startDate).toLocaleDateString();
                const end = new Date(l.endDate).toLocaleDateString();
                const range = start === end ? start : `${start} → ${end}`;
                const days = l.days != null ? Number(l.days) : null;
                return (
                  <tr key={l.id}>
                    {isManager && <TD>{l.user ? `${l.user.firstName} ${l.user.lastName}` : "—"}</TD>}
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <Badge tone="leave" size="sm">{l.leaveType ?? l.type}</Badge>
                        {l.isHalfDay && <Badge tone="info" size="sm">Half</Badge>}
                      </div>
                    </TD>
                    <TD>{range}</TD>
                    <TD className="tabular-nums">{days != null ? days.toFixed(days % 1 === 0 ? 0 : 1) : "—"}</TD>
                    <TD>
                      <Badge
                        tone={l.source && l.source !== "REQUESTED" ? "destructive" : "neutral"}
                        size="sm"
                      >
                        {sourceLabel(l.source)}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone={l.isPaid === false ? "destructive" : "positive"} size="sm">
                        {l.isPaid === false ? "Unpaid" : "Paid"}
                      </Badge>
                    </TD>
                    <TD><StatusBadge status={l.status} /></TD>
                    {isManager && (
                      <TD>
                        {l.status === "PENDING" && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => statusMutation.mutate({ id: l.id, status: "APPROVED" })}>Approve</Button>
                            <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: l.id, status: "REJECTED" })}>Reject</Button>
                          </div>
                        )}
                      </TD>
                    )}
                  </tr>
                );
              })
            )}
          </TBody>
        </Table>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Request Leave</DialogTitle></DialogHeader>
          {/* Policy reminder right inside the dialog so the user sees the
              cap before they pick a type. */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="font-semibold">Only 2 paid leaves per month.</span>{" "}
            Beyond that, every leave (any type) is logged as unpaid and trims the
            performance score (−0.1 per day).
          </div>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Leave Type" name="leaveType" required error={form.formState.errors.leaveType?.message}>
              <Select
                value={form.watch("leaveType")}
                onValueChange={(v) => form.setValue("leaveType", v)}
                options={[
                  { value: "ANNUAL", label: "Annual Leave" },
                  { value: "SICK", label: "Sick Leave" },
                  { value: "CASUAL", label: "Casual Leave" },
                ]}
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.watch("isHalfDay")}
                onChange={(e) => form.setValue("isHalfDay", e.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              <span>Half day</span>
              <span className="text-xs text-slate-500">— consumes 0.5 day, single date only</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Date" name="startDate" required error={form.formState.errors.startDate?.message}>
                <DatePicker value={form.watch("startDate")} onChange={(d) => form.setValue("startDate", d!)} />
              </FormField>
              <FormField
                label={isHalfDay ? "End Date (locked to start)" : "End Date"}
                name="endDate"
                required
                error={form.formState.errors.endDate?.message}
              >
                <DatePicker
                  value={form.watch("endDate")}
                  onChange={(d) => form.setValue("endDate", d!)}
                  minDate={form.watch("startDate")}
                  disabled={isHalfDay}
                />
              </FormField>
            </div>
            {monthly && (
              <p className="text-xs text-slate-500">
                {monthly.remaining > 0
                  ? `${monthly.remaining} paid leave${monthly.remaining === 1 ? "" : "s"} left this month.`
                  : `Monthly paid-leave cap of ${monthly.cap} used — this request will be logged as unpaid.`}
              </p>
            )}
            <FormField label="Reason" name="reason" error={form.formState.errors.reason?.message}>
              <TextArea
                {...form.register("reason")}
                placeholder="Optional note"
                rows={3}
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
