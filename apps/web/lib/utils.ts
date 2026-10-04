import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely extract an array from an API response that might be:
 * - A plain array: [...]
 * - A paginated response: { data: [...], meta: {...} }
 * - null/undefined
 */
export function toArray<T>(response: unknown): T[] {
  if (!response) return [];
  if (Array.isArray(response)) return response as T[];
  if (typeof response === "object" && response !== null && "data" in response) {
    const data = (response as { data: unknown }).data;
    if (Array.isArray(data)) return data as T[];
  }
  return [];
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatHours(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function relativeTime(date: string | Date | null | undefined): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}


/**
 * True if the user has the CLIENT role. Used to exclude external client users
 * from internal-only pickers (assignees, project managers, account managers).
 *
 * Tolerates both shapes seen on /users and /auth/me:
 *   - `[{ role: { code: "CLIENT" } }, ...]` (pivot form)
 *   - `["CLIENT", ...]` (flat form)
 */
export function isClientRoleUser(u: {
  roles?: Array<{ role?: { code?: string } } | string> | null;
}): boolean {
  if (!u?.roles) return false;
  return u.roles.some((r) =>
    typeof r === "string" ? r === "CLIENT" : r?.role?.code === "CLIENT",
  );
}

/**
 * Convenience filter — drop CLIENT users from a list. Accepts any row shape
 * so callers don't need to widen their types; we read `roles` defensively.
 */
export function staffOnly<T>(users: T[]): T[] {
  return users.filter((u) => !isClientRoleUser(u as any));
}
