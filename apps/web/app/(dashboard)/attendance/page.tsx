"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ModuleHeader } from "@/components/layout/module-header";
import { ViewAsSelector } from "@/components/admin/view-as-selector";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/ui/state";
import {
  useAllLeaveRequests,
  useAttendance,
  useAttendanceHrSummary,
  useAttendanceToday,
  useTeamAttendance,
  useUsers,
} from "@/lib/api/hooks";
import { useClockIn, useClockOut, useUpdateOfficeSettings } from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { apiFetch } from "@/lib/api/client";
import { useQuery } from "@tanstack/react-query";
import { Download, LogIn, LogOut, MapPin } from "lucide-react";
import { toast } from "@/lib/hooks/use-toast";
import { downloadCsv, rowsToCsv } from "@/lib/utils/csv";
import {
  GeolocationError,
  getBrowserLocation,
  getGeolocationPermissionState,
  type GeolocationPermissionState,
} from "@/lib/utils/geolocation";

interface OfficeSettings {
  id: string | null;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  geofenceEnabled: boolean;
}

interface AttendanceRow {
  id: string;
  userId?: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  totalHours?: number;
  status?: "PRESENT" | "LATE" | "HALF_DAY" | "ABSENT" | "ON_LEAVE" | "HOLIDAY";
  lateMinutes?: number;
  user?: { id?: string; firstName: string; lastName: string };
}

function StatusBadge({ status, lateMinutes }: { status?: AttendanceRow["status"]; lateMinutes?: number }) {
  if (!status) return <Badge size="sm" tone="neutral">—</Badge>;
  switch (status) {
    case "PRESENT":
      return <Badge size="sm" tone="positive">On time</Badge>;
    case "LATE":
      return <Badge size="sm" tone="warning">Late {lateMinutes ? `· ${lateMinutes}m` : ""}</Badge>;
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

export default function AttendancePage() {
  const role = useAuthStore((s) => s.user?.roles[0] ?? "EMPLOYEE");
  const isManager = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"].includes(role);

  const searchParams = useSearchParams();
  const viewUserId = searchParams.get("userId") ?? undefined;
  const selfQuery = useAttendance(viewUserId);
  const teamQuery = useTeamAttendance(isManager && !viewUserId);
  const todayQuery = useAttendanceToday(!viewUserId);
  const hrSummaryQuery = useAttendanceHrSummary();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const updateOffice = useUpdateOfficeSettings();
  // Only SUPER_ADMIN / ADMIN may toggle the geofence — same gate as the
  // PATCH /attendance/office-settings endpoint.
  const canToggleGeofence = ["SUPER_ADMIN", "ADMIN"].includes(role);

  const officeQuery = useQuery({
    queryKey: ["office-settings"],
    queryFn: () => apiFetch<OfficeSettings>("/attendance/office-settings"),
  });

  const [busy, setBusy] = useState<null | "in" | "out">(null);
  // Track the in-flight admin GPS capture (Use my current location button).
  // We use a dedicated flag rather than overloading `busy` because the
  // capture chains into the updateOffice mutation and we want the
  // button label / inline status to reflect each step distinctly.
  const [capturingOffice, setCapturingOffice] = useState(false);
  // Track the OS / browser geolocation permission so we can warn the user
  // BEFORE they click Clock In. Once denied, getCurrentPosition stops
  // showing the prompt and just errors silently — the inline banner
  // makes the recovery path discoverable.
  const [geoPermission, setGeoPermission] = useState<GeolocationPermissionState | null>(null);
  useEffect(() => {
    let cancelled = false;
    getGeolocationPermissionState().then((s) => { if (!cancelled) setGeoPermission(s); });
    // Re-poll on window focus so toggling the OS / browser setting and
    // tabbing back updates the banner without a hard reload.
    const onFocus = () => {
      getGeolocationPermissionState().then((s) => { if (!cancelled) setGeoPermission(s); });
    };
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, []);

  // ── Filter state ──
  // `dateFrom` / `dateTo` are YYYY-MM-DD strings (native input type=date).
  // Empty string = unfiltered. Status / employee dropdowns default to "All".
  const [fFrom, setFFrom] = useState<string>("");
  const [fTo, setFTo] = useState<string>("");
  const [fEmployee, setFEmployee] = useState<string>("");
  const [fStatus, setFStatus] = useState<string>("");

  // ── Leave-summary filter (HR section) ──
  // Independent from the records filter above so HR can keep both views
  // open with different periods. "preset" of "" means a custom range
  // driven by lFrom/lTo.
  const [lPreset, setLPreset] = useState<"month" | "year" | "custom">("month");
  const [lFrom, setLFrom] = useState<string>("");
  const [lTo, setLTo] = useState<string>("");

  const usersQuery = useUsers();
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

  // HR pulls every leave request to power the leave-summary aggregation.
  // For non-HR viewers the query is disabled (the endpoint is HR-gated
  // anyway, but skipping the fetch avoids a 403 in the network tab).
  const allLeaveQuery = useAllLeaveRequests(isManager && !viewUserId);

  // Resolve the leave-summary date window from the preset / custom inputs.
  // We anchor "month" / "year" on the current calendar period since this
  // is a live HR view; if HR wants historical periods they switch to
  // "custom".
  const leavePeriod = useMemo(() => {
    const now = new Date();
    if (lPreset === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { from: start, to: end, label: now.toLocaleString(undefined, { month: "long", year: "numeric" }) };
    }
    if (lPreset === "year") {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear() + 1, 0, 1);
      return { from: start, to: end, label: String(now.getFullYear()) };
    }
    const f = lFrom ? new Date(lFrom) : new Date(0);
    // For the "to" boundary make it exclusive (+1 day) so a custom range
    // like "2026-05-14 → 2026-05-14" includes that whole day.
    const tBase = lTo ? new Date(lTo) : new Date();
    const t = new Date(tBase.getFullYear(), tBase.getMonth(), tBase.getDate() + 1);
    return { from: f, to: t, label: `${lFrom || "…"} → ${lTo || "today"}` };
  }, [lPreset, lFrom, lTo]);

  // Aggregate leave per employee for the resolved period. `days` is a
  // Decimal serialized as string/number — we coerce via Number().
  interface LeaveRecord {
    id: string;
    userId: string;
    days?: number | string;
    isHalfDay?: boolean;
    isPaid?: boolean;
    source?: "REQUESTED" | "AUTO_HALF_DAY" | "AUTO_LATE_PENALTY";
    startDate: string;
    status: string;
    user?: { firstName?: string; lastName?: string; email?: string };
  }
  const leaveSummary = useMemo(() => {
    const rows = ((allLeaveQuery.data ?? []) as unknown as LeaveRecord[])
      .filter((r) => r.status !== "REJECTED" && r.status !== "CANCELLED")
      .filter((r) => {
        const d = new Date(r.startDate);
        return d >= leavePeriod.from && d < leavePeriod.to;
      });
    const byUser = new Map<string, {
      userId: string;
      name: string;
      total: number;
      paid: number;
      unpaid: number;
      halfDays: number;
      penalties: number;
      lastDate: string | null;
    }>();
    for (const r of rows) {
      const name = r.user
        ? `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() || r.user.email || r.userId
        : r.userId;
      const slot = byUser.get(r.userId) ?? {
        userId: r.userId,
        name,
        total: 0,
        paid: 0,
        unpaid: 0,
        halfDays: 0,
        penalties: 0,
        lastDate: null as string | null,
      };
      const days = r.days != null ? Number(r.days) : 1;
      slot.total += days;
      if (r.isPaid === false) slot.unpaid += days;
      else slot.paid += days;
      if (r.isHalfDay) slot.halfDays += 1;
      if (r.source === "AUTO_LATE_PENALTY") slot.penalties += 1;
      if (!slot.lastDate || r.startDate > slot.lastDate) slot.lastDate = r.startDate;
      byUser.set(r.userId, slot);
    }
    return [...byUser.values()].sort((a, b) => b.total - a.total);
  }, [allLeaveQuery.data, leavePeriod.from, leavePeriod.to]);

  const exportLeaveSummary = () => {
    const csv = rowsToCsv(leaveSummary, [
      { key: "userId", label: "User ID" },
      { key: "name", label: "Employee" },
      { key: "total", label: "Total days" },
      { key: "paid", label: "Paid" },
      { key: "unpaid", label: "Unpaid" },
      { key: "halfDays", label: "Half-day count" },
      { key: "penalties", label: "Late penalties" },
      {
        key: "lastDate",
        label: "Last leave date",
        map: (r) => (r.lastDate ? r.lastDate.slice(0, 10) : ""),
      },
    ]);
    const tag =
      lPreset === "month"
        ? `${leavePeriod.from.getFullYear()}-${String(leavePeriod.from.getMonth() + 1).padStart(2, "0")}`
        : lPreset === "year"
          ? String(leavePeriod.from.getFullYear())
          : `${lFrom || "start"}_${lTo || "end"}`;
    downloadCsv(`leave-summary-${tag}.csv`, csv);
  };

  const query = isManager && !viewUserId ? teamQuery : selfQuery;

  if (query.isLoading) return <LoadingState label="Loading attendance..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load attendance." />;

  const recordsRaw = (query.data ?? []) as unknown as AttendanceRow[];

  // Apply filters client-side. Date comparison uses YYYY-MM-DD lexical
  // ordering — works because the date column is stored as a date and
  // toISOString().slice(0,10) gives sortable strings.
  const records = recordsRaw.filter((r) => {
    const day = r.date.slice(0, 10);
    if (fFrom && day < fFrom) return false;
    if (fTo && day > fTo) return false;
    const userId = r.user?.id ?? r.userId;
    if (fEmployee && userId !== fEmployee) return false;
    if (fStatus && r.status !== fStatus) return false;
    return true;
  });

  // Shared GPS-capture flow used by both the "first-time setup" amber card
  // and the "update office to my location" button on the active banner.
  // Surfaces inline status + a toast on success/failure so the user always
  // sees feedback (the silent-fail-on-permission-denied was the previous
  // pain point).
  const captureOfficeLocation = async (enable: boolean) => {
    if (!geofence) return;
    setCapturingOffice(true);
    try {
      // Re-poll permission state right before the call so the inline
      // banners and toast description reflect reality.
      const perm = await getGeolocationPermissionState();
      setGeoPermission(perm);
      const c = await getBrowserLocation();
      updateOffice.mutate(
        {
          name: geofence.name || "Main Office",
          latitude: c.latitude,
          longitude: c.longitude,
          radiusMeters: geofence.radiusMeters || 100,
          geofenceEnabled: enable,
        },
        {
          onSuccess: () =>
            toast({
              variant: "success",
              title: "Office location saved",
              description: `Captured at ${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`,
            }),
          onSettled: () => setCapturingOffice(false),
        },
      );
    } catch (err) {
      setCapturingOffice(false);
      const ge = err instanceof GeolocationError ? err : null;
      toast({
        variant: "error",
        title: ge?.message ?? "Couldn't capture location",
        description: ge?.hint ?? (err instanceof Error ? err.message : "Unknown error"),
        duration: 12_000,
      });
    }
  };

  const exportCsv = () => {
    const csv = rowsToCsv(records, [
      { key: "id", label: "ID" },
      {
        key: "user",
        label: "Employee",
        map: (r) => (r.user ? `${r.user.firstName} ${r.user.lastName}`.trim() : ""),
      },
      { key: "date", label: "Date", map: (r) => r.date.slice(0, 10) },
      { key: "status", label: "Status", map: (r) => r.status ?? "" },
      { key: "lateMinutes", label: "LateMinutes", map: (r) => r.lateMinutes ?? 0 },
      {
        key: "checkIn",
        label: "CheckIn",
        map: (r) => (r.checkIn ? new Date(r.checkIn).toISOString() : ""),
      },
      {
        key: "checkOut",
        label: "CheckOut",
        map: (r) => (r.checkOut ? new Date(r.checkOut).toISOString() : ""),
      },
      { key: "totalHours", label: "TotalHours", map: (r) => r.totalHours ?? "" },
    ]);
    const stamp = fFrom || fTo ? `-${fFrom || "start"}_${fTo || "end"}` : "";
    downloadCsv(`attendance${stamp}.csv`, csv);
  };
  const geofence = officeQuery.data;
  const geofenceActive = geofence?.geofenceEnabled ?? false;
  const today = todayQuery.data;
  const monthly = today?.monthly;
  // Per-day one-shot gating: once checked in, the check-in button must
  // disappear; once checked out, both buttons disappear and the row is
  // locked until tomorrow.
  const hasCheckedIn = !!today?.today?.checkIn;
  const hasCheckedOut = !!today?.today?.checkOut;
  const canClockIn = !hasCheckedIn && (today?.isWorkingDay ?? true);
  const canClockOut = hasCheckedIn && !hasCheckedOut;

  const handleClock = async (type: "in" | "out") => {
    setBusy(type);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;

      if (geofenceActive) {
        try {
          const loc = await getBrowserLocation();
          latitude = loc.latitude;
          longitude = loc.longitude;
        } catch (err) {
          // Surface the typed hint (reset instructions / OS check) so the
          // user knows exactly which switch to flip rather than seeing
          // the raw "User denied Geolocation" from the browser.
          const ge = err instanceof GeolocationError ? err : null;
          toast({
            variant: "error",
            title: ge?.message ?? "Location required",
            description: ge?.hint ?? (err instanceof Error ? err.message : "Please enable location access."),
            duration: 12_000,
          });
          setBusy(null);
          return;
        }
      }

      const payload = { timestamp: new Date().toISOString(), latitude, longitude };
      if (type === "in") {
        clockIn.mutate(payload, { onSettled: () => setBusy(null) });
      } else {
        clockOut.mutate(payload, { onSettled: () => setBusy(null) });
      }
    } catch {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <ModuleHeader
        module="attendance"
        title="Attendance & Work Hours"
        description={
          hasCheckedOut
            ? "Done for the day — clock-in resets at midnight."
            : hasCheckedIn
              ? "Clocked in — clock out to finish your day."
              : "Track clock-in records, late counts, and monthly attendance trends."
        }
        // One action at a time, gated by today's state:
        //   • not checked in (working day) → Clock In
        //   • checked in, not out → Clock Out
        //   • checked out → no action (row is locked for the day)
        primaryAction={
          canClockIn
            ? {
                label: busy === "in" ? "Checking..." : "Clock In",
                icon: <LogIn className="mr-1 size-4" />,
                onClick: () => handleClock("in"),
              }
            : canClockOut
              ? {
                  label: busy === "out" ? "Checking..." : "Clock Out",
                  icon: <LogOut className="mr-1 size-4" />,
                  onClick: () => handleClock("out"),
                }
              : undefined
        }
      />

      <div className="-mt-2 flex justify-end"><ViewAsSelector /></div>

      {/* Personal monthly summary cards */}
      {monthly && today?.policy && (
        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-amber-500">
            <div className="text-xs uppercase tracking-wider text-slate-400">Lates · this month</div>
            <div className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">
              {monthly.lateCount}
              <span className="ml-1 text-sm font-normal text-slate-400">/ {monthly.lateStreakThreshold}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {monthly.lateCount >= monthly.lateStreakThreshold
                ? "Penalty triggered — paid leave deducted."
                : `${monthly.lateStreakThreshold - monthly.lateCount} more before penalty.`}
            </div>
          </Card>
          <Card className="border-l-4 border-l-indigo-500">
            <div className="text-xs uppercase tracking-wider text-slate-400">Paid leaves · this month</div>
            <div className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">
              {monthly.paidLeavesUsed}
              <span className="ml-1 text-sm font-normal text-slate-400">/ {monthly.monthlyPaidLeaveCap}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">Beyond cap is logged as unpaid.</div>
          </Card>
          <Card className="border-l-4 border-l-slate-400">
            <div className="text-xs uppercase tracking-wider text-slate-400">Your shift</div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
              {String(today.policy.officeStartHour).padStart(2, "0")}:{String(today.policy.officeStartMinute ?? 0).padStart(2, "0")} → {String(today.policy.officeEndHour).padStart(2, "0")}:{String(today.policy.officeEndMinute ?? 0).padStart(2, "0")}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Grace {today.policy.graceMinutes} min · half-day after {String(today.policy.halfDayCutoffHour).padStart(2, "0")}:{String(today.policy.halfDayCutoffMinute ?? 0).padStart(2, "0")}. Each employee follows their own assigned shift.
            </div>
          </Card>
        </section>
      )}

      {/* Admin-only quick-setup card. Shows when office coordinates aren't
          set yet (lat=0 && lng=0) — captures the admin's current GPS in
          one click, writes it as the office anchor, and enables the
          geofence. Skipped once a real location exists. */}
      {canToggleGeofence && geofence && geofence.latitude === 0 && geofence.longitude === 0 && (
        <Card className="border-l-4 border-l-amber-500">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
              <MapPin className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base">Set office location</CardTitle>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Capture your current GPS as the office anchor. Employees must clock in within{" "}
                <span className="font-semibold">{geofence.radiusMeters || 100}m</span> of that point.
              </p>
              {/* Inline status — visible during the GPS lookup so the user
                  sees the click registered even before the prompt appears. */}
              {capturingOffice && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  Asking your browser for GPS — accept the prompt if it appears…
                </p>
              )}
              {geoPermission === "denied" && !capturingOffice && (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                  Location is currently <span className="font-semibold">blocked</span> for this site —
                  re-allow it in the browser address-bar lock icon, then click below again.
                </p>
              )}
            </div>
            <Button
              size="sm"
              disabled={updateOffice.isPending || capturingOffice}
              onClick={() => captureOfficeLocation(true)}
            >
              {capturingOffice
                ? "Capturing GPS…"
                : updateOffice.isPending
                  ? "Saving…"
                  : "Use my current location"}
            </Button>
          </div>
        </Card>
      )}

      {/* Inline alert when the browser has remembered a previous "Block".
          We show this BEFORE the user clicks Clock In so the recovery
          steps are visible up-front, not buried in a toast that fires
          after a frustrating failed attempt. */}
      {geofenceActive && geoPermission === "denied" && (
        <Card className="border-l-4 border-l-rose-500">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="rounded-lg bg-rose-100 p-2 dark:bg-rose-900/30">
              <MapPin className="size-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Location blocked by your browser</CardTitle>
                <Badge tone="destructive" size="sm">Denied</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                You previously blocked location for this site, so the browser won't ask again.
                Re-allow it to clock in — your browser <span className="font-semibold">won't</span> prompt by itself, you have to flip the switch manually:
              </p>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-slate-600 dark:text-slate-400">
                <li>Click the lock / page-info icon in the address bar.</li>
                <li>Find <span className="font-mono text-xs">Location</span> and switch it to <span className="font-semibold">Allow</span>.</li>
                <li>Reload this page (Cmd-R / Ctrl-R) and click Clock In again.</li>
              </ol>
              {canToggleGeofence && (
                <p className="mt-2 text-xs text-slate-500">
                  Or just disable the geofence below if you're testing.
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Geo-fence banner */}
      {geofenceActive && geofence && (
        <Card className="border-l-4 border-l-teal-500">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-teal-100 p-2 dark:bg-teal-900/30">
              <MapPin className="size-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Office Location Required</CardTitle>
                <Badge tone="positive" size="sm" dot>Active</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                You must be within <span className="font-semibold">{geofence.radiusMeters}m</span> of <span className="font-semibold">{geofence.name}</span> to clock in or out.
                Your browser will prompt for location access.
              </p>
            </div>
            {canToggleGeofence && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={updateOffice.isPending || capturingOffice}
                  onClick={() => captureOfficeLocation(true)}
                  title="Update the office anchor to your current GPS"
                >
                  {capturingOffice ? "Capturing GPS…" : "Update to my location"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={updateOffice.isPending || capturingOffice}
                  onClick={() =>
                    updateOffice.mutate({
                      name: geofence.name,
                      latitude: geofence.latitude,
                      longitude: geofence.longitude,
                      radiusMeters: geofence.radiusMeters,
                      geofenceEnabled: false,
                    })
                  }
                >
                  {updateOffice.isPending ? "Disabling…" : "Disable geofence"}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {!geofenceActive && (
        <Card className="border-l-4 border-l-slate-400">
          <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
            <MapPin className="size-4" />
            <span>Location-based attendance is currently <span className="font-semibold">disabled</span>. Employees can clock in from anywhere.</span>
            {canToggleGeofence && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                disabled={updateOffice.isPending || !geofence || geofence.latitude === 0}
                onClick={() =>
                  geofence &&
                  updateOffice.mutate({
                    name: geofence.name,
                    latitude: geofence.latitude,
                    longitude: geofence.longitude,
                    radiusMeters: geofence.radiusMeters,
                    geofenceEnabled: true,
                  })
                }
                title={geofence?.latitude === 0 ? "Set office coordinates in Settings first" : undefined}
              >
                {updateOffice.isPending ? "Enabling…" : "Enable"}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* HR — Leave Summary per Employee (filterable period) */}
      {isManager && !viewUserId && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Leave Summary</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">
                Days taken per employee · {leavePeriod.label}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={exportLeaveSummary}
              disabled={leaveSummary.length === 0}
            >
              <Download className="mr-1 size-4" />
              Export CSV
            </Button>
          </div>

          {/* Period selector — three presets + custom range */}
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div className="flex rounded-lg border border-border bg-white p-0.5 dark:bg-slate-950">
              {(["month", "year", "custom"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setLPreset(p)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    lPreset === p
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  {p === "month" ? "This Month" : p === "year" ? "This Year" : "Custom"}
                </button>
              ))}
            </div>
            {lPreset === "custom" && (
              <>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">From</label>
                  <Input type="date" value={lFrom} onChange={(e) => setLFrom(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">To</label>
                  <Input type="date" value={lTo} onChange={(e) => setLTo(e.target.value)} min={lFrom || undefined} />
                </div>
              </>
            )}
          </div>

          {allLeaveQuery.isLoading ? (
            <div className="py-4 text-sm text-slate-400">Loading leave data…</div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Total</TH>
                  <TH>Paid</TH>
                  <TH>Unpaid</TH>
                  <TH>Half-days</TH>
                  <TH>Late penalties</TH>
                  <TH>Last leave</TH>
                </tr>
              </THead>
              <TBody>
                {leaveSummary.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                      No leave records in this period.
                    </td>
                  </tr>
                ) : (
                  leaveSummary.map((r) => (
                    <tr key={r.userId}>
                      <TD>{r.name}</TD>
                      <TD className="tabular-nums font-semibold">{r.total.toFixed(r.total % 1 === 0 ? 0 : 1)}</TD>
                      <TD className="tabular-nums">
                        <span className="text-emerald-700 dark:text-emerald-300">
                          {r.paid.toFixed(r.paid % 1 === 0 ? 0 : 1)}
                        </span>
                      </TD>
                      <TD className="tabular-nums">
                        <span className={r.unpaid > 0 ? "font-semibold text-rose-600" : "text-slate-400"}>
                          {r.unpaid.toFixed(r.unpaid % 1 === 0 ? 0 : 1)}
                        </span>
                      </TD>
                      <TD className="tabular-nums">{r.halfDays}</TD>
                      <TD className="tabular-nums">
                        <span className={r.penalties > 0 ? "font-semibold text-amber-600" : "text-slate-400"}>
                          {r.penalties}
                        </span>
                      </TD>
                      <TD>{r.lastDate ? new Date(r.lastDate).toLocaleDateString() : "—"}</TD>
                    </tr>
                  ))
                )}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {/* HR — per-employee monthly counts */}
      {isManager && !viewUserId && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <CardTitle>This Month — Per Employee</CardTitle>
            <span className="text-xs text-slate-500">PRESENT / LATE / HALF-DAY / ABSENT</span>
          </div>
          {hrSummaryQuery.isLoading ? (
            <div className="py-4 text-sm text-slate-400">Loading…</div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Present</TH>
                  <TH>Late</TH>
                  <TH>Half-day</TH>
                  <TH>Absent</TH>
                </tr>
              </THead>
              <TBody>
                {(hrSummaryQuery.data ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-sm text-slate-400">No attendance recorded this month.</td></tr>
                ) : (
                  (hrSummaryQuery.data ?? []).map((r) => (
                    <tr key={r.userId}>
                      <TD>{r.user ? `${r.user.firstName} ${r.user.lastName}` : r.userId}</TD>
                      <TD className="tabular-nums">{r.present}</TD>
                      <TD className="tabular-nums">
                        <span className={r.late >= 3 ? "font-semibold text-amber-600" : ""}>{r.late}</span>
                      </TD>
                      <TD className="tabular-nums">{r.halfDay}</TD>
                      <TD className="tabular-nums">
                        <span className={r.absent > 0 ? "font-semibold text-rose-600" : ""}>{r.absent}</span>
                      </TD>
                    </tr>
                  ))
                )}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <CardTitle>Records</CardTitle>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{records.length} of {recordsRaw.length}</span>
            <Button size="sm" variant="secondary" onClick={exportCsv} disabled={records.length === 0}>
              <Download className="mr-1 size-4" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="mb-3 grid gap-2 md:grid-cols-3 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">From</label>
            <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">To</label>
            <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} min={fFrom || undefined} />
          </div>
          {isManager && !viewUserId && (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Employee</label>
              <Select value={fEmployee} onValueChange={setFEmployee} options={employeeOptions} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</label>
            <Select
              value={fStatus}
              onValueChange={setFStatus}
              options={[
                { value: "", label: "All" },
                { value: "PRESENT", label: "On time" },
                { value: "LATE", label: "Late" },
                { value: "HALF_DAY", label: "Half-day" },
                { value: "ABSENT", label: "Absent" },
                { value: "ON_LEAVE", label: "On leave" },
                { value: "HOLIDAY", label: "Holiday" },
              ]}
            />
          </div>
          <div className="flex items-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setFFrom(""); setFTo(""); setFEmployee(""); setFStatus(""); }}
              disabled={!fFrom && !fTo && !fEmployee && !fStatus}
            >
              Clear filters
            </Button>
          </div>
        </div>

        <Table>
          <THead>
            <tr>
              {isManager && <TH>Employee</TH>}
              <TH>Date</TH>
              <TH>Status</TH>
              <TH>Check In</TH>
              <TH>Check Out</TH>
              <TH>Total Hours</TH>
            </tr>
          </THead>
          <TBody>
            {records.length === 0 ? (
              <tr><td colSpan={isManager ? 6 : 5} className="py-8 text-center text-sm text-slate-400">No attendance records match the current filters.</td></tr>
            ) : (
              records.map((r) => (
                <tr key={r.id}>
                  {isManager && <TD>{r.user ? `${r.user.firstName} ${r.user.lastName}` : "—"}</TD>}
                  <TD>{new Date(r.date).toLocaleDateString()}</TD>
                  <TD><StatusBadge status={r.status} lateMinutes={r.lateMinutes} /></TD>
                  <TD>{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : "—"}</TD>
                  <TD>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : "—"}</TD>
                  <TD>{r.totalHours != null ? `${Number(r.totalHours).toFixed(1)}h` : "—"}</TD>
                </tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
