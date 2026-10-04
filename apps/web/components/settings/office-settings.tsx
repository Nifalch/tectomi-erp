"use client";

import { useState, useEffect } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form";
import { NumberInput } from "@/components/ui/number-input";
import { LoadingState } from "@/components/ui/state";
import { apiFetch } from "@/lib/api/client";
import { useQuery } from "@tanstack/react-query";
import { useUpdateOfficeSettings } from "@/lib/api/mutations";
import { toast } from "@/lib/hooks/use-toast";
import { MapPin, Crosshair, Network, Plus, CheckCircle2, XCircle, ShieldOff, Loader2 } from "lucide-react";
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
  allowedIpAddresses?: string | null;
}

export function OfficeSettingsTab() {
  const query = useQuery({
    queryKey: ["office-settings"],
    queryFn: () => apiFetch<OfficeSettings>("/attendance/office-settings"),
  });
  const mutation = useUpdateOfficeSettings();

  const [name, setName] = useState("Main Office");
  const [latitude, setLatitude] = useState<number | null>(0);
  const [longitude, setLongitude] = useState<number | null>(0);
  const [radius, setRadius] = useState<number | null>(100);
  const [enabled, setEnabled] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [allowedIps, setAllowedIps] = useState("");
  const [addingMyIp, setAddingMyIp] = useState(false);
  const [testing, setTesting] = useState(false);
  const [networkCheck, setNetworkCheck] = useState<{
    seenIp: string | null;
    geofenceEnabled: boolean;
    hasAllowlist?: boolean;
    matchesAllowlist: boolean;
    message: string;
  } | null>(null);
  // Track the browser geolocation permission so we can disable the
  // detect button + show an inline alert BEFORE the user clicks. Without
  // this, the user can spam-click a denied-state button and each rejection
  // stacks another toast (which is what you saw in the screenshot).
  const [geoPermission, setGeoPermission] = useState<GeolocationPermissionState | null>(null);

  useEffect(() => {
    if (query.data) {
      setName(query.data.name);
      setLatitude(query.data.latitude);
      setLongitude(query.data.longitude);
      setRadius(query.data.radiusMeters);
      setEnabled(query.data.geofenceEnabled);
      setAllowedIps(query.data.allowedIpAddresses ?? "");
    }
  }, [query.data]);

  /**
   * Hit the API's `my-ip` endpoint and append the result to the
   * allowlist. Saves the admin the trouble of looking up the office
   * external IP separately (most don't know it offhand). Dedupes so a
   * click-twice doesn't add the same entry.
   */
  const addCurrentIp = async () => {
    setAddingMyIp(true);
    try {
      const { ip, isLoopback, note } = await apiFetch<{
        ip: string | null;
        isLoopback?: boolean;
        note?: string | null;
      }>("/attendance/my-ip");
      if (!ip) {
        toast({ variant: "error", title: "Couldn't read this network's IP" });
        return;
      }
      const existing = allowedIps.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
      if (existing.includes(ip)) {
        toast({ variant: "info", title: `${ip} is already in the allowlist` });
        return;
      }
      setAllowedIps((prev) => (prev.trim() ? `${prev.replace(/[\s,;]+$/, "")}, ${ip}` : ip));
      toast({
        variant: isLoopback ? "info" : "success",
        title: isLoopback ? `Added ${ip} (loopback)` : `Added ${ip}`,
        description: note ?? "Click Save to apply.",
        duration: isLoopback ? 14_000 : 5_000,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Couldn't fetch IP",
        description: err instanceof Error ? err.message : "",
      });
    } finally {
      setAddingMyIp(false);
    }
  };

  /**
   * Live network check — hits /attendance/check-network and shows whether
   * the current IP is already in the office allowlist. Helps admins
   * diagnose "office network attendance isn't working" without having to
   * SSH into the API or guess at NAT addresses.
   */
  const testCurrentNetwork = async () => {
    setTesting(true);
    try {
      const result = await apiFetch<{
        seenIp: string | null;
        geofenceEnabled: boolean;
        hasAllowlist?: boolean;
        matchesAllowlist: boolean;
        message: string;
      }>("/attendance/check-network");
      setNetworkCheck(result);
    } catch (err) {
      toast({
        variant: "error",
        title: "Network check failed",
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setTesting(false);
    }
  };

  // Re-poll permission state on mount + window focus so toggling the
  // browser site-settings and tabbing back updates the UI without a
  // hard reload.
  useEffect(() => {
    let cancelled = false;
    const poll = () => getGeolocationPermissionState().then((s) => { if (!cancelled) setGeoPermission(s); });
    poll();
    window.addEventListener("focus", poll);
    return () => { cancelled = true; window.removeEventListener("focus", poll); };
  }, []);

  const useMyLocation = async () => {
    // Hard-stop when the browser has already denied — calling
    // getCurrentPosition would silently reject and we'd just stack
    // another toast on top of the inline alert. The button is also
    // disabled, but defend in depth.
    if (geoPermission === "denied") return;
    setDetecting(true);
    try {
      const c = await getBrowserLocation();
      setLatitude(c.latitude);
      setLongitude(c.longitude);
      toast({ variant: "success", title: "Location detected" });
      // Permission state may have flipped from "prompt" → "granted" — refresh.
      const next = await getGeolocationPermissionState();
      setGeoPermission(next);
    } catch (err) {
      const ge = err instanceof GeolocationError ? err : null;
      // Update inline state so the disabled button + alert show up
      // immediately on the first failure, not just after a re-poll.
      if (ge?.code === "PERMISSION_DENIED") setGeoPermission("denied");
      toast({
        variant: "error",
        title: ge?.message ?? "Unable to get location",
        description: ge?.hint ?? (err instanceof Error ? err.message : ""),
        duration: 12_000,
      });
    } finally {
      setDetecting(false);
    }
  };

  const handleSave = () => {
    if (latitude === null || longitude === null) {
      toast({ variant: "error", title: "Latitude and longitude required" });
      return;
    }
    mutation.mutate({
      name,
      latitude,
      longitude,
      radiusMeters: radius ?? 100,
      geofenceEnabled: enabled,
      allowedIpAddresses: allowedIps.trim() ? allowedIps.trim() : null,
    });
  };

  if (query.isLoading) return <LoadingState label="Loading office settings..." />;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-teal-100 p-2 dark:bg-teal-900/30">
              <MapPin className="size-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <CardTitle>Office Location / Geo-fencing</CardTitle>
              <CardDescription className="mt-1">
                Require employees to be physically at the office to clock in/out.
              </CardDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${enabled ? "bg-teal-500" : "bg-slate-300 dark:bg-slate-700"}`}
          >
            <span className={`inline-block size-5 rounded-full bg-white shadow transition ${enabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
          <span className="text-sm font-medium">Status:</span>
          {enabled ? (
            <Badge tone="positive" size="sm" dot>Geo-fence Active</Badge>
          ) : (
            <Badge tone="neutral" size="sm" dot>Disabled</Badge>
          )}
          <span className="ml-auto text-xs text-slate-500">
            {enabled ? "Employees must be within the radius to mark attendance" : "Employees can clock in from anywhere"}
          </span>
        </div>
      </Card>

      <Card>
        <CardTitle>Office Coordinates</CardTitle>
        <CardDescription className="mt-1 mb-4">
          Set the latitude and longitude of your office. Use "Use My Location" if you're currently at the office.
        </CardDescription>

        <div className="space-y-4">
          <FormField label="Office Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Office" />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Latitude" required>
              <NumberInput value={latitude} onChange={setLatitude} step={0.000001} placeholder="12.971598" />
            </FormField>
            <FormField label="Longitude" required>
              <NumberInput value={longitude} onChange={setLongitude} step={0.000001} placeholder="77.594566" />
            </FormField>
          </div>

          <FormField label="Radius (meters)" description="Distance from the office point within which clock-in is allowed">
            <NumberInput value={radius} onChange={setRadius} suffix="m" placeholder="100" />
          </FormField>

          {/* Persistent inline alert when the browser has already denied
              location — replaces the toast spam. Stays on screen until the
              user re-grants permission and tabs back (focus re-poll updates
              geoPermission, hiding this card). */}
          {geoPermission === "denied" && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-800 dark:bg-rose-950/30">
              <div className="flex items-start gap-2">
                <MapPin className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <div>
                  <div className="font-semibold text-rose-700 dark:text-rose-200">
                    Location is blocked for this site
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    Your browser remembers a previous "Block". To re-enable:
                  </p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-600 dark:text-slate-400">
                    <li>Click the lock / page-info icon next to <span className="font-mono">{typeof window !== "undefined" ? window.location.host : "this site"}</span> in the address bar.</li>
                    <li>Switch <span className="font-mono">Location</span> to <span className="font-semibold">Allow</span>.</li>
                    <li>Reload this page — this notice will disappear.</li>
                  </ol>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Meanwhile you can type the coordinates manually in the fields above and click Save.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={useMyLocation}
              disabled={detecting || geoPermission === "denied"}
              title={
                geoPermission === "denied"
                  ? "Location is blocked in your browser — see the alert above to re-enable"
                  : undefined
              }
            >
              <Crosshair className="mr-2 size-4" />
              {detecting
                ? "Detecting..."
                : geoPermission === "denied"
                  ? "Location blocked"
                  : "Use My Current Location"}
            </Button>
            <Button type="button" onClick={handleSave} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>

          {latitude && longitude && (
            <a
              href={`https://www.google.com/maps?q=${latitude},${longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <MapPin className="size-3" /> View on Google Maps
            </a>
          )}
        </div>
      </Card>

      {/* Trusted IP allowlist — secondary signal so laptops on the
          office WiFi that can't deliver GPS still pass the geofence
          check. Each entry is an IPv4/IPv6 address or a CIDR block. */}
      <Card>
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
            <Network className="size-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1">
            <CardTitle>Trusted Office Networks</CardTitle>
            <CardDescription className="mt-1">
              When a clock-in request comes from one of these IPs or CIDR ranges, the geofence check passes even without GPS. Useful for laptops on office WiFi that can&apos;t deliver a reliable position.
            </CardDescription>
          </div>
        </div>

        <FormField
          label="Allowed IPs / CIDR ranges"
          description="Comma, space, or newline-separated. Supports IPv4, IPv6, and CIDR blocks (e.g. 203.0.113.42, 198.51.100.0/24)."
        >
          <TextArea
            value={allowedIps}
            onChange={(e) => setAllowedIps(e.target.value)}
            rows={4}
            placeholder="203.0.113.42, 198.51.100.0/24"
            className="font-mono text-xs"
          />
        </FormField>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={addCurrentIp} disabled={addingMyIp}>
            <Plus className="mr-2 size-4" />
            {addingMyIp ? "Detecting…" : "Add this network's IP"}
          </Button>
          <Button type="button" variant="secondary" onClick={testCurrentNetwork} disabled={testing}>
            {testing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Network className="mr-2 size-4" />}
            Test this network
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Tip: open this from the office WiFi and click the buttons — Tectomi ERP will detect the public IP and tell you whether it&apos;s already trusted.
        </p>

        {/* Live network-check result */}
        {networkCheck && (
          <div
            className={
              "mt-4 flex items-start gap-3 rounded-xl border p-3 text-sm " +
              (networkCheck.geofenceEnabled
                ? networkCheck.matchesAllowlist
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-200"
                  : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
                : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300")
            }
          >
            <div className="mt-0.5 shrink-0">
              {!networkCheck.geofenceEnabled ? (
                <ShieldOff className="size-4" />
              ) : networkCheck.matchesAllowlist ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <XCircle className="size-4" />
              )}
            </div>
            <div className="space-y-1">
              <div className="font-medium">
                {networkCheck.seenIp ? (
                  <>API saw: <span className="font-mono">{networkCheck.seenIp}</span></>
                ) : (
                  "Could not read your network IP"
                )}
              </div>
              <div className="text-xs">{networkCheck.message}</div>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
