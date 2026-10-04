"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form";
import { LoadingState } from "@/components/ui/state";
import { useAttendancePolicy } from "@/lib/api/hooks";
import { useUpdateAttendancePolicy } from "@/lib/api/mutations";
import { toast } from "@/lib/hooks/use-toast";

const WEEKDAYS: Array<{ bit: number; label: string }> = [
  { bit: 0, label: "Sun" },
  { bit: 1, label: "Mon" },
  { bit: 2, label: "Tue" },
  { bit: 3, label: "Wed" },
  { bit: 4, label: "Thu" },
  { bit: 5, label: "Fri" },
  { bit: 6, label: "Sat" },
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toTimeStr(h: number | undefined, m: number | undefined): string {
  if (h == null) return "";
  return `${pad2(h)}:${pad2(m ?? 0)}`;
}

function fromTimeStr(value: string): { hour: number; minute: number } | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function addHours(time: string, hours: number): string {
  const parts = fromTimeStr(time);
  if (!parts) return time;
  const total = Math.min(23 * 60 + 59, parts.hour * 60 + parts.minute + Math.round(hours * 60));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/**
 * Org-wide attendance policy editor: working hours window, grace, half-day
 * cutoff, late-streak threshold, monthly paid-leave cap, and working days.
 * Times use the native `<input type="time">` so admins can pick 09:30,
 * 13:15, etc. without typing two numbers.
 */
export function AttendancePolicyCard() {
  const policyQuery = useAttendancePolicy();
  const update = useUpdateAttendancePolicy();

  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("18:00");
  const [graceMinutes, setGraceMinutes] = useState(10);
  const [halfDayCutoff, setHalfDayCutoff] = useState("12:00");
  const [requiredDailyHours, setRequiredDailyHours] = useState(8);
  const [lateStreakThreshold, setLateStreakThreshold] = useState(3);
  const [monthlyPaidLeaveCap, setMonthlyPaidLeaveCap] = useState(2);
  const [workingDaysMask, setWorkingDaysMask] = useState(126);

  useEffect(() => {
    const p = policyQuery.data;
    if (!p) return;
    setStartTime(toTimeStr(p.officeStartHour, p.officeStartMinute));
    setEndTime(toTimeStr(p.officeEndHour, p.officeEndMinute));
    setGraceMinutes(p.graceMinutes ?? 10);
    setHalfDayCutoff(toTimeStr(p.halfDayCutoffHour, p.halfDayCutoffMinute));
    setRequiredDailyHours(p.requiredDailyHours ?? 8);
    setLateStreakThreshold(p.lateStreakThreshold ?? 3);
    setMonthlyPaidLeaveCap(p.monthlyPaidLeaveCap ?? 2);
    setWorkingDaysMask(p.workingDaysMask ?? 126);
  }, [policyQuery.data]);

  if (policyQuery.isLoading) return <LoadingState label="Loading policy…" />;

  const toggleDay = (bit: number) => {
    setWorkingDaysMask((m) => m ^ (1 << bit));
  };

  const save = () => {
    const start = fromTimeStr(startTime);
    const end = fromTimeStr(endTime);
    const cutoff = fromTimeStr(halfDayCutoff);
    if (!start || !end || !cutoff) {
      // Don't silently no-op — clicking "Save policy" with a cleared time
      // field used to do nothing and the user assumed the page was broken.
      const missing: string[] = [];
      if (!start) missing.push("office start");
      if (!end) missing.push("office end");
      if (!cutoff) missing.push("half-day cutoff");
      toast({
        variant: "error",
        title: "Invalid time",
        description: `Check the value for: ${missing.join(", ")}.`,
      });
      return;
    }
    update.mutate({
      officeStartHour: start.hour,
      officeStartMinute: start.minute,
      officeEndHour: end.hour,
      officeEndMinute: end.minute,
      halfDayCutoffHour: cutoff.hour,
      halfDayCutoffMinute: cutoff.minute,
      graceMinutes,
      requiredDailyHours,
      lateStreakThreshold,
      monthlyPaidLeaveCap,
      workingDaysMask,
    });
  };

  return (
    <Card className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Clock className="size-5" />
        </div>
        <div>
          <CardTitle>Working hours & grace</CardTitle>
          <CardDescription>
            Org-wide defaults. Times accept any minute (09:30, 13:15, etc.). Each
            employee can override the start/end in their HR profile.
          </CardDescription>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Default office start">
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-11 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus:border-primary dark:bg-slate-950/60"
          />
        </FormField>
        <FormField label="Default office end">
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="h-11 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus:border-primary dark:bg-slate-950/60"
          />
        </FormField>
      </div>

      <FormField label="Required hours per day">
        <Input
          type="number"
          min={0.5}
          max={24}
          step={0.5}
          value={requiredDailyHours}
          onChange={(e) => setRequiredDailyHours(Math.max(0.5, Math.min(24, Number(e.target.value) || 8)))}
        />
        <p className="mt-1.5 text-[11px] text-slate-500">
          Each employee must work this many hours daily. An employee assigned a start of <span className="font-mono">09:30</span> with{" "}
          <span className="font-mono">{requiredDailyHours}</span>h required is expected to check out at{" "}
          <span className="font-mono">{addHours("09:30", requiredDailyHours)}</span>.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[6, 7, 7.5, 8, 8.5, 9].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setRequiredDailyHours(h)}
              className={
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition " +
                (requiredDailyHours === h
                  ? "border-primary bg-primary text-white"
                  : "border-border text-slate-600 hover:border-slate-300 dark:text-slate-300")
              }
            >
              {h} h
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Grace period (minutes after start counted as on-time)">
        <Input
          type="number"
          min={0}
          max={120}
          value={graceMinutes}
          onChange={(e) => setGraceMinutes(Math.max(0, Math.min(120, Number(e.target.value) || 0)))}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[0, 5, 10, 15, 20, 30, 45, 60].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setGraceMinutes(m)}
              className={
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition " +
                (graceMinutes === m
                  ? "border-primary bg-primary text-white"
                  : "border-border text-slate-600 hover:border-slate-300 dark:text-slate-300")
              }
            >
              {m} min
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Half-day cutoff (check-in at/after this time auto-marks half-day)">
        <input
          type="time"
          value={halfDayCutoff}
          onChange={(e) => setHalfDayCutoff(e.target.value)}
          className="h-11 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus:border-primary dark:bg-slate-950/60"
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Late-streak threshold (deduct one paid leave every Nth late)">
          <Input
            type="number"
            min={1}
            max={20}
            value={lateStreakThreshold}
            onChange={(e) => setLateStreakThreshold(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          />
        </FormField>
        <FormField label="Monthly paid-leave cap (before unpaid kicks in)">
          <Input
            type="number"
            min={0}
            max={31}
            value={monthlyPaidLeaveCap}
            onChange={(e) => setMonthlyPaidLeaveCap(Math.max(0, Math.min(31, Number(e.target.value) || 0)))}
          />
        </FormField>
      </div>

      <FormField label="Working days">
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => {
            const enabled = (workingDaysMask & (1 << d.bit)) !== 0;
            return (
              <button
                key={d.bit}
                type="button"
                onClick={() => toggleDay(d.bit)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium transition " +
                  (enabled
                    ? "border-primary bg-primary text-white"
                    : "border-border text-slate-500 hover:border-slate-300 dark:text-slate-400")
                }
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </FormField>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          <ShieldAlert className="size-3.5" /> Changes apply immediately to all future check-ins.
        </span>
        <Button onClick={save} disabled={update.isPending} size="sm">
          {update.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Save policy
        </Button>
      </div>
    </Card>
  );
}
