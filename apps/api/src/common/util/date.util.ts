/**
 * Date helpers that avoid the JavaScript `setMonth` overflow trap.
 *
 * `new Date("2026-01-31").setMonth(month + 1)` produces "Feb 31" which JS
 * silently rolls forward to "Mar 3" — so monthly recurring tasks/invoices
 * scheduled on the 31st would skip February entirely (and short months in
 * general). These helpers clamp to the last day of the target month.
 */

/** Days in the given Gregorian month (1-based month index unusual: pass 0..11). */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Mutates `d` to advance by `months` months, snapping the day to:
 *   1. `pinnedDay` when supplied and ≤ daysInTargetMonth
 *   2. otherwise the source date's `getDate()` clamped to daysInTargetMonth
 *
 * Examples:
 *   advanceMonth(Jan 31, 1)        → Feb 28/29 (clamped)
 *   advanceMonth(May 15, 1)        → Jun 15
 *   advanceMonth(May 31, 1)        → Jun 30 (clamped)
 *   advanceMonth(Jan 15, 1, 31)    → Feb 28/29 (pinned day clamped)
 */
export function advanceMonth(d: Date, months: number, pinnedDay?: number | null): void {
  const sourceDay = d.getDate();
  // First move to the 1st of the source month — eliminates the overflow
  // that happens when the source day is past the target month's length.
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const max = daysInMonth(d.getFullYear(), d.getMonth());
  const targetDay = Math.min(pinnedDay && pinnedDay > 0 ? pinnedDay : sourceDay, max);
  d.setDate(targetDay);
}

/** Pure (non-mutating) variant for places that prefer functional style. */
export function withMonthAdvanced(date: Date, months: number, pinnedDay?: number | null): Date {
  const d = new Date(date);
  advanceMonth(d, months, pinnedDay);
  return d;
}
