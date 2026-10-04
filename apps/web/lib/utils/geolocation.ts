/**
 * Browser geolocation helper used by Clock-In flows.
 *
 * Wraps `navigator.geolocation.getCurrentPosition` in a Promise that
 * resolves to lat/lng OR rejects with a {@link GeolocationError} carrying
 * a `code` we can branch on for the UI. The default browser error message
 * ("User denied Geolocation") is too cryptic for non-technical users —
 * the codes let the caller render copy with reset instructions.
 */

export type GeolocationErrorCode = "PERMISSION_DENIED" | "UNAVAILABLE" | "TIMEOUT" | "UNSUPPORTED";

export class GeolocationError extends Error {
  code: GeolocationErrorCode;
  /** Human-readable copy + actionable next step. */
  hint: string;

  constructor(code: GeolocationErrorCode, message: string, hint: string) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

const HINTS: Record<GeolocationErrorCode, string> = {
  PERMISSION_DENIED:
    "Open the lock icon in the address bar → Site settings → Location → Allow, then retry. " +
    "If you can't allow location, ask HR to disable the office geofence.",
  UNAVAILABLE:
    "Location services are on but your device couldn't pin a position. Make sure WiFi is connected " +
    "(laptops use WiFi networks to triangulate), turn WiFi off and on once, then retry. If you're on " +
    "macOS, also check System Settings → Privacy & Security → Location Services → make sure both your " +
    "browser AND System Services › Find My are enabled.",
  TIMEOUT:
    "Location lookup took too long. Move to an open spot near a window and try again.",
  UNSUPPORTED:
    "This browser doesn't support geolocation. Try Chrome, Edge, or Safari on a recent version.",
};

/**
 * Read the current geolocation permission state without triggering a
 * prompt. Returns `null` if the Permissions API isn't supported (older
 * browsers — we fall back to attempting getCurrentPosition in that case).
 *
 * Critical for the UX flow: once a user clicks "Block" on the browser
 * prompt, the next `getCurrentPosition()` rejects synchronously WITHOUT
 * re-asking. The page never sees a prompt — it just fails. By polling the
 * permission state up-front we can warn the user before they click, and
 * show OS-specific re-grant instructions inline.
 */
export type GeolocationPermissionState = "granted" | "denied" | "prompt";

export async function getGeolocationPermissionState(): Promise<GeolocationPermissionState | null> {
  if (typeof navigator === "undefined" || !navigator.permissions) return null;
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state as GeolocationPermissionState;
  } catch {
    return null;
  }
}

function mapBrowserError(err: GeolocationPositionError): GeolocationError {
  const code: GeolocationErrorCode =
    err.code === 1
      ? "PERMISSION_DENIED"
      : err.code === 2
        ? "UNAVAILABLE"
        : err.code === 3
          ? "TIMEOUT"
          : "UNAVAILABLE";
  const title =
    code === "PERMISSION_DENIED"
      ? "Location permission denied"
      : code === "TIMEOUT"
        ? "Location timed out"
        : "Location unavailable";
  return new GeolocationError(code, title, HINTS[code]);
}

function singleAttempt(opts: PositionOptions): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(mapBrowserError(err)),
      opts,
    );
  });
}

/**
 * Try to read a position with a fallback strategy. Many laptops (Macs
 * especially) can't satisfy `enableHighAccuracy: true` reliably because
 * they lack GPS and depend on WiFi triangulation — high-accuracy mode
 * just errors out as UNAVAILABLE when it can't reach a GPS or accurate
 * source. We:
 *   1. Try high-accuracy + fresh (10s timeout)
 *   2. On UNAVAILABLE or TIMEOUT, retry low-accuracy with a longer
 *      timeout and a 5-minute cache window allowed
 * PERMISSION_DENIED is fatal and surfaced immediately — no point
 * retrying when the user has explicitly blocked the site.
 */
export async function getBrowserLocation(): Promise<{ latitude: number; longitude: number }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new GeolocationError("UNSUPPORTED", "Geolocation is not supported by this browser.", HINTS.UNSUPPORTED);
  }
  try {
    return await singleAttempt({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });
  } catch (err) {
    if (err instanceof GeolocationError && err.code === "PERMISSION_DENIED") throw err;
    // Fall back to a more forgiving attempt. enableHighAccuracy:false
    // lets the OS use cell/WiFi without trying for GPS, and a 5-min
    // cache window means we accept a recent position even if a fresh
    // one isn't currently obtainable.
    return await singleAttempt({ enableHighAccuracy: false, timeout: 20_000, maximumAge: 5 * 60_000 });
  }
}
