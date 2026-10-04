"use client";

import { useEffect, useState } from "react";
import { Clock, LogIn, LogOut, MapPin } from "lucide-react";
import { useAttendanceToday } from "@/lib/api/hooks";
import { useClockIn, useClockOut, useUpdateOfficeSettings } from "@/lib/api/mutations";
import { toast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  GeolocationError,
  getBrowserLocation,
  getGeolocationPermissionState,
  type GeolocationPermissionState,
} from "@/lib/utils/geolocation";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store/auth-store";
import Link from "next/link";

/**
 * Geolocation needs a secure context — HTTPS or localhost. If the app
 * is being accessed over plain HTTP at a LAN IP, browsers will silently
 * refuse to even show the permission prompt. Worth surfacing as its own
 * branch since the fix is "open the right URL", not "click Allow".
 */
function isSecureGeoContext(): boolean {
  if (typeof window === "undefined") return true;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}

function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusColor(status?: string): { dot: string; badge: string } {
  switch (status) {
    case "LATE":
      return { dot: "bg-amber-500", badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300" };
    case "HALF_DAY":
      return { dot: "bg-rose-500", badge: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300" };
    case "PRESENT":
    default:
      return { dot: "bg-emerald-500", badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" };
  }
}

/**
 * Topbar attendance widget — primary quick-access for clock-in/out.
 *
 *  - Not a working day → "Off" badge, no actions
 *  - No check-in yet → green "Check In" CTA
 *  - Check-in only → colored status pill ("On time" / "Late by Nm" /
 *    "Half-day") with a "Clock Out" button
 *  - Check-in + check-out → "Done HH:MM → HH:MM" badge
 *
 * Geolocation captured per click when the office geofence is enabled.
 */
export function AttendancePill() {
  const todayQuery = useAttendanceToday();
  const clockInMut = useClockIn();
  const clockOutMut = useClockOut();
  const updateOfficeMut = useUpdateOfficeSettings();
  const [busy, setBusy] = useState<null | "in" | "out">(null);
  // Poll the geolocation permission so we can warn the user BEFORE they
  // click — once denied, the browser stops prompting and getCurrentPosition
  // rejects silently. Without this pre-check the user just sees "Checking…"
  // briefly, no prompt, and an error toast they may not read.
  const [geoPerm, setGeoPerm] = useState<GeolocationPermissionState | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpReason, setHelpReason] = useState<"denied" | "unavailable">("denied");
  const [retrying, setRetrying] = useState(false);
  // Whether this viewer can flip the org-wide geofence toggle. Admins
  // and HR get a shortcut button straight to Office Settings inside the
  // help modal so they're not stuck guessing where the bypass lives.
  const authUser = useAuthStore((s) => s.user);
  const canManageGeofence = !!authUser?.roles?.some((r) =>
    ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"].includes(r),
  );
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      getGeolocationPermissionState().then((s) => { if (!cancelled) setGeoPerm(s); });
    refresh();
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; window.removeEventListener("focus", refresh); };
  }, []);

  /**
   * Admin-only one-click escape hatch: turn the org's geofence OFF and
   * immediately clock the admin in without coordinates. Used when an
   * admin's own device is failing to report location and they need to
   * keep moving — they can re-enable the geofence from Office Settings
   * once they've sorted their device. Non-admins never see this button.
   */
  const disableGeofenceAndClockIn = async () => {
    try {
      await updateOfficeMut.mutateAsync({ geofenceEnabled: false });
      setHelpOpen(false);
      // Fire clock-in (or clock-out, depending on state) without coords —
      // the API's verifyLocation() will short-circuit now that the
      // geofence is off.
      const payload = { timestamp: new Date().toISOString() };
      if (!today?.checkIn) {
        clockInMut.mutate(payload);
      } else if (!today.checkOut) {
        clockOutMut.mutate(payload);
      }
      toast({
        variant: "info",
        title: "Geofence disabled",
        description: "Re-enable it from Settings → Office Settings once your device is reporting location again.",
        duration: 10_000,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Couldn't disable geofence",
        description: err instanceof Error ? err.message : "Try again or open Settings → Office Settings.",
      });
    }
  };

  // "Try again" inside the help modal — re-attempts getCurrentPosition.
  // This succeeds once the user has flipped the permission in their
  // browser/OS settings without needing a page reload.
  const retryPermission = async () => {
    setRetrying(true);
    try {
      const c = await getBrowserLocation();
      setGeoPerm("granted");
      setHelpOpen(false);
      toast({
        variant: "success",
        title: "Location is on",
        description: `Got it (${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}). You can now check in.`,
      });
    } catch (err) {
      const ge = err instanceof GeolocationError ? err : null;
      if (ge?.code === "PERMISSION_DENIED") setGeoPerm("denied");
      toast({
        variant: "error",
        title: ge?.message ?? "Still blocked",
        description: ge?.hint ?? "Reset the site location permission in your browser, then try again.",
        duration: 10_000,
      });
    } finally {
      setRetrying(false);
    }
  };

  const data = todayQuery.data;
  const today = data?.today;
  const office = data?.office;
  const monthly = data?.monthly;
  // `policy` here is the per-employee effective policy from the API —
  // already overlaid with any shift override on the user's profile.
  const policy = data?.policy as
    | { officeStartHour?: number; officeStartMinute?: number; officeEndHour?: number; officeEndMinute?: number }
    | undefined;
  const shiftLabel = (() => {
    if (policy?.officeStartHour == null || policy?.officeEndHour == null) return null;
    const fmt = (h: number, m: number) =>
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    return `${fmt(policy.officeStartHour, policy.officeStartMinute ?? 0)}–${fmt(policy.officeEndHour, policy.officeEndMinute ?? 0)}`;
  })();

  // Tick once per minute so the "running" time updates.
  const [_, setTick] = useState(0);
  useEffect(() => {
    if (!today?.checkIn || today?.checkOut) return;
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [today?.checkIn, today?.checkOut]);

  if (todayQuery.isLoading || !data) {
    return (
      <div className="hidden h-9 w-32 animate-pulse rounded-full border border-border bg-white/70 dark:bg-slate-950/60 md:block" />
    );
  }

  // Off day or holiday — show a passive badge.
  if (!data.isWorkingDay || today?.status === "HOLIDAY") {
    return (
      <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 md:inline-flex">
        <Clock className="size-3.5" /> Off day
      </div>
    );
  }

  const runAction = async (type: "in" | "out") => {
    setBusy(type);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      if (office?.geofenceEnabled) {
        // Try to grab GPS — but DON'T block the request when it isn't
        // available. The backend's IP allowlist may still let us in
        // (office WiFi case). We only show the help modal AFTER the API
        // returns "Location required", not pre-emptively. The previous
        // behavior blocked clock-out on the office WiFi because GPS was
        // denied and the request never reached the IP check.
        const canTryGeo = isSecureGeoContext() && geoPerm !== "denied";
        if (canTryGeo) {
          try {
            const c = await getBrowserLocation();
            latitude = c.latitude;
            longitude = c.longitude;
            // Refresh cached permission state so the pill picks up a
            // "prompt → granted" transition without a reload.
            getGeolocationPermissionState().then(setGeoPerm).catch(() => {});
          } catch (err) {
            const ge = err instanceof GeolocationError ? err : null;
            // PERMISSION_DENIED / UNAVAILABLE / TIMEOUT — all fall
            // through. The API's IP allowlist gets the chance to
            // pass first; the help modal only opens if the backend
            // tells us location was actually required.
            if (ge?.code === "PERMISSION_DENIED") setGeoPerm("denied");
          }
        }
      }
      const payload = { timestamp: new Date().toISOString(), latitude, longitude };
      // The API rejects with "Location required..." when the geofence
      // is on, GPS failed, AND the IP isn't in the office allowlist.
      // Pick the right help-modal flavor based on which preflight
      // blocked: denied → permission help, otherwise → device help.
      const onError = (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (office?.geofenceEnabled && /location required/i.test(msg)) {
          setHelpReason(geoPerm === "denied" ? "denied" : "unavailable");
          setHelpOpen(true);
        }
      };
      if (type === "in") {
        clockInMut.mutate(payload, { onSettled: () => setBusy(null), onError });
      } else {
        clockOutMut.mutate(payload, { onSettled: () => setBusy(null), onError });
      }
    } catch {
      setBusy(null);
    }
  };

  const lateCount = monthly?.lateCount ?? 0;
  const lateThreshold = monthly?.lateStreakThreshold ?? 3;
  const nearLimit = lateCount >= lateThreshold - 1;
  const tooltip = [
    shiftLabel ? `Shift: ${shiftLabel}` : null,
    `Lates this month: ${lateCount}/${lateThreshold}`,
    `Paid leaves: ${monthly?.paidLeavesUsed ?? 0}/${monthly?.monthlyPaidLeaveCap ?? 2}`,
    office?.geofenceEnabled ? `Geofence: ${office.name} (${office.radiusMeters}m)` : "Geofence off",
  ].filter(Boolean).join(" · ");

  const helpDialog = (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {helpReason === "denied" ? "Allow location to check in" : "Your device couldn't share its location"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
          {helpReason === "denied" ? (
            <>
              <p>
                Your office has a location check turned on for attendance, but this browser is currently blocking Tectomi ERP from reading your location. Browsers don&apos;t let websites re-ask once you&apos;ve clicked <span className="font-semibold">Block</span> — you&apos;ll need to switch it back on yourself, then come back here and try again.
              </p>
              <div className="rounded-lg border border-border bg-slate-50 p-3 text-xs leading-relaxed dark:bg-slate-900/60">
                <p className="font-semibold text-slate-700 dark:text-slate-200">Chrome / Edge / Brave</p>
                <p className="mt-1">
                  Click the <span className="font-medium">lock</span> (or <span className="font-medium">tune</span>) icon next to the address bar → <span className="font-medium">Site settings</span> → set <span className="font-medium">Location</span> to <span className="font-medium">Allow</span>.
                </p>
                <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">Safari</p>
                <p className="mt-1">
                  Safari menu → <span className="font-medium">Settings</span> → <span className="font-medium">Websites</span> → <span className="font-medium">Location</span> → set Tectomi ERP to <span className="font-medium">Allow</span>.
                </p>
                <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">macOS extra layer</p>
                <p className="mt-1">
                  <span className="font-medium">System Settings</span> → <span className="font-medium">Privacy &amp; Security</span> → <span className="font-medium">Location Services</span> — make sure your browser is enabled there too.
                </p>
              </div>
            </>
          ) : (
            <>
              <p>
                Location permission is allowed, but the OS itself couldn&apos;t pin a position. This usually means your device can&apos;t reach a location source (no GPS, WiFi disconnected, or the OS-level location service is paused).
              </p>
              <div className="rounded-lg border border-border bg-slate-50 p-3 text-xs leading-relaxed dark:bg-slate-900/60">
                <p className="font-semibold text-slate-700 dark:text-slate-200">Quick fixes</p>
                <ul className="mt-1 list-disc pl-5 space-y-1">
                  <li>Make sure WiFi is <span className="font-medium">on and connected</span> — laptops triangulate from nearby networks.</li>
                  <li>Toggle WiFi off and on once — kicks the OS to refresh its position cache.</li>
                  <li>If you&apos;re on a phone, step near a window or outdoors so GPS can lock.</li>
                </ul>
                <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">macOS: check Location Services</p>
                <p className="mt-1">
                  <span className="font-medium">System Settings</span> → <span className="font-medium">Privacy &amp; Security</span> → <span className="font-medium">Location Services</span>. Make sure it&apos;s ON, your <span className="font-medium">browser</span> is enabled, and inside <span className="font-medium">Details…</span> at the bottom, <span className="font-medium">System Services › Find My</span> is also enabled (Find My being off silently breaks all browser location).
                </p>
              </div>
            </>
          )}
          {canManageGeofence && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-semibold text-amber-800 dark:text-amber-200">Admin shortcut</p>
              <p className="mt-1">
                Your device can&apos;t share location right now. Disable the office geofence requirement and clock in immediately — you can re-enable it from{" "}
                <Link
                  href="/settings"
                  onClick={() => setHelpOpen(false)}
                  className="font-medium underline hover:no-underline"
                >
                  Settings → Office Settings
                </Link>{" "}
                once your device is back to sharing position.
              </p>
              <Button
                size="sm"
                onClick={disableGeofenceAndClockIn}
                disabled={updateOfficeMut.isPending}
                className="mt-3 bg-amber-600 hover:bg-amber-700"
              >
                {updateOfficeMut.isPending ? "Disabling…" : "Disable geofence & clock in"}
              </Button>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Once you&apos;ve fixed it, click <span className="font-semibold">Try again</span> below. No page reload needed.
          </p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setHelpOpen(false)}>Close</Button>
          <Button onClick={retryPermission} disabled={retrying}>
            {retrying ? "Checking…" : "Try again"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // State 1 — no check-in yet today.
  if (!today?.checkIn) {
    return (
      <>
        <button
          onClick={() => runAction("in")}
          disabled={busy === "in"}
          title={tooltip}
          className={cn(
            "hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition md:inline-flex",
            "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900",
            busy === "in" && "opacity-60",
          )}
        >
          <LogIn className="size-3.5" />
          {busy === "in" ? "Checking…" : "Check In"}
          {office?.geofenceEnabled && <MapPin className="size-3" />}
          {nearLimit && (
            <span className="ml-1 rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-900">
              {lateCount}/{lateThreshold} late
            </span>
          )}
        </button>
        {/* Mobile compact check-in button */}
        <button
          onClick={() => runAction("in")}
          disabled={busy === "in"}
          title={tooltip}
          aria-label="Check In"
          className={cn(
            "inline-flex items-center justify-center rounded-full border p-1.5 text-xs font-semibold transition md:hidden",
            "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
            busy === "in" && "opacity-60",
          )}
        >
          <LogIn className="size-4" />
        </button>
        {helpDialog}
      </>
    );
  }

  // State 2 — checked in, not checked out yet.
  if (today.checkIn && !today.checkOut) {
    const c = statusColor(today.status);
    const label =
      today.status === "HALF_DAY"
        ? "Half-day"
        : today.status === "LATE"
          ? `Late ${today.lateMinutes}m`
          : "On time";
    return (
      <>
        <div
          className={cn(
            "hidden items-center divide-x rounded-full border text-xs font-semibold md:inline-flex",
            c.badge,
            "divide-current/15",
          )}
          title={tooltip}
        >
          <div className="inline-flex items-center gap-1.5 pl-3 pr-2.5 py-1.5">
            <span className={cn("size-1.5 rounded-full", c.dot)} />
            <span>{label}</span>
            <span className="opacity-50">·</span>
            <span className="tabular-nums">{formatTime(today.checkIn)}</span>
          </div>
          <button
            onClick={() => runAction("out")}
            disabled={busy === "out"}
            className={cn(
              "inline-flex items-center gap-1 pl-2.5 pr-3 py-1.5 transition hover:bg-black/5 dark:hover:bg-white/5 rounded-r-full",
              busy === "out" && "opacity-60",
            )}
          >
            <LogOut className="size-3.5" />
            <span>{busy === "out" ? "…" : "Out"}</span>
          </button>
        </div>
        {/* Mobile compact checked-in status & clock out */}
        <button
          onClick={() => runAction("out")}
          disabled={busy === "out"}
          title={tooltip}
          aria-label="Clock out"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold md:hidden",
            c.badge,
            busy === "out" && "opacity-60",
          )}
        >
          <span className={cn("size-1.5 rounded-full animate-pulse", c.dot)} />
          <LogOut className="size-3" />
        </button>
        {helpDialog}
      </>
    );
  }

  // State 3 — done for the day.
  const c = statusColor(today.status);
  return (
    <>
      <div
        className={cn(
          "hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold md:inline-flex",
          c.badge,
        )}
        title={tooltip}
      >
        <span className={cn("size-1.5 rounded-full", c.dot)} />
        Done · {formatTime(today.checkIn)} → {formatTime(today.checkOut)}
      </div>
      {/* Mobile compact done badge */}
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold md:hidden",
          c.badge,
        )}
        title={tooltip}
      >
        <span className={cn("size-1.5 rounded-full", c.dot)} />
        <span className="text-[10px]">Done</span>
      </div>
      {helpDialog}
    </>
  );
}
