/**
 * IP-allowlist matching for office attendance. When a clock-in request
 * comes from a trusted office IP (or CIDR block), we treat it as
 * geographically equivalent to "GPS within geofence" — laptops on the
 * office WiFi often can't deliver a usable position even when location
 * services are on, and falling back to network identity is the standard
 * way real attendance systems handle this.
 *
 * Supports plain IPv4 (203.0.113.42), IPv4 CIDR (198.51.100.0/24),
 * plain IPv6 (2001:db8::1), and IPv6 CIDR (2001:db8::/32). Unknown or
 * malformed entries are silently skipped — never throw from here, since
 * a bad allowlist row shouldn't break someone's clock-in.
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const b = Number(p);
    if (!Number.isInteger(b) || b < 0 || b > 255) return null;
    n = (n << 8) + b;
  }
  // `>>> 0` to coerce back to unsigned (left-shift in JS treats numbers
  // as 32-bit signed; the high bit ends up negative without this).
  return n >>> 0;
}

function expandIpv6(ip: string): bigint | null {
  try {
    const lower = ip.toLowerCase();
    // Expand the "::" shorthand into the right number of zero groups.
    let parts: string[];
    if (lower.includes("::")) {
      const [head, tail] = lower.split("::");
      const headParts = head ? head.split(":") : [];
      const tailParts = tail ? tail.split(":") : [];
      const missing = 8 - headParts.length - tailParts.length;
      if (missing < 0) return null;
      parts = [...headParts, ...new Array(missing).fill("0"), ...tailParts];
    } else {
      parts = lower.split(":");
    }
    if (parts.length !== 8) return null;
    let n = 0n;
    for (const p of parts) {
      const v = parseInt(p || "0", 16);
      if (Number.isNaN(v) || v < 0 || v > 0xffff) return null;
      n = (n << 16n) + BigInt(v);
    }
    return n;
  } catch {
    return null;
  }
}

function matchIpv4(clientIp: string, entry: string): boolean {
  const [base, maskStr] = entry.split("/");
  const baseInt = ipv4ToInt(base);
  const clientInt = ipv4ToInt(clientIp);
  if (baseInt == null || clientInt == null) return false;
  if (maskStr == null) return baseInt === clientInt;
  const mask = Number(maskStr);
  if (!Number.isInteger(mask) || mask < 0 || mask > 32) return false;
  const m = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
  return (baseInt & m) === (clientInt & m);
}

function matchIpv6(clientIp: string, entry: string): boolean {
  const [base, maskStr] = entry.split("/");
  const baseInt = expandIpv6(base);
  const clientInt = expandIpv6(clientIp);
  if (baseInt == null || clientInt == null) return false;
  if (maskStr == null) return baseInt === clientInt;
  const mask = Number(maskStr);
  if (!Number.isInteger(mask) || mask < 0 || mask > 128) return false;
  const m = mask === 0 ? 0n : ((1n << BigInt(mask)) - 1n) << BigInt(128 - mask);
  return (baseInt & m) === (clientInt & m);
}

/**
 * Normalize "client IPs" that Express produces in containerised setups:
 *   - IPv4-mapped IPv6 ("::ffff:1.2.3.4")  →  "1.2.3.4"
 *   - IPv6 loopback                        →  "127.0.0.1"
 * Returns the input unchanged when no rewrite applies.
 */
export function normalizeClientIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed === "::1") return "127.0.0.1";
  const mapped = trimmed.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mapped) return mapped[1];
  return trimmed;
}

export function isIpAllowed(clientIp: string | null | undefined, allowlist: string | null | undefined): boolean {
  const ip = normalizeClientIp(clientIp);
  if (!ip || !allowlist) return false;
  const entries = allowlist
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  for (const entry of entries) {
    // Decide v4 vs v6 by presence of a colon — base addresses don't
    // legally mix. Containerised setups can pass v4 as ::ffff:1.2.3.4,
    // which we already stripped in normalizeClientIp.
    const isV6 = entry.includes(":");
    const match = isV6 ? matchIpv6(ip, entry) : matchIpv4(ip, entry);
    if (match) return true;
  }
  return false;
}
