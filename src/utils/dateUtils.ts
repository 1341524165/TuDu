/**
 * Date utility functions for Calendar.
 *
 * Rules:
 * - `dueDate` is stored as local YYYY-MM-DD text. Parse via splitDateString,
 *   never via `new Date('YYYY-MM-DD')` (which would be interpreted as UTC).
 * - `createdAt` / `completedAt` are ISO timestamps. Convert to the browser's
 *   local timezone for display and date-bucketing.
 */

/** Parse a YYYY-MM-DD string into { year, month (0-based), day }. */
export function splitDateString(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

/** Parse a YYYY-MM-DD string into a local Date at midnight. Safe from UTC shift. */
export function parseDateLocal(dateStr: string): Date {
  const { year, month, day } = splitDateString(dateStr);
  return new Date(year, month, day);
}

/** Format a Date to YYYY-MM-DD in local timezone. */
export function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Convert an ISO timestamp string to local YYYY-MM-DD. */
export function isoToLocalDate(isoStr: string): string {
  return formatDateLocal(new Date(isoStr));
}

/** Get ISO string for the start of a local date (00:00:00). */
export function localDateStartISO(dateStr: string): string {
  return parseDateLocal(dateStr).toISOString();
}

/** Get ISO string for the end of a local date (23:59:59.999). */
export function localDateEndISO(dateStr: string): string {
  const d = parseDateLocal(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * Return the 42 dates (6 weeks) for a month calendar grid,
 * starting from Monday.
 */
export function getCalendarGridDates(year: number, month: number): Date[] {
  // First day of the month
  const firstDay = new Date(year, month, 1);
  // Day of week: 0=Sun, 1=Mon, ... 6=Sat
  // We want Monday=0, so shift: (dow + 6) % 7
  const dow = (firstDay.getDay() + 6) % 7;

  // Start from Monday of the week containing the 1st
  const startDate = new Date(year, month, 1 - dow);

  const dates: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    dates.push(d);
  }
  return dates;
}

/** Get the YYYY-MM-DD range for a 42-cell calendar grid. */
export function getCalendarGridRange(year: number, month: number): { dateStart: string; dateEnd: string; isoStart: string; isoEnd: string } {
  const dates = getCalendarGridDates(year, month);
  const dateStart = formatDateLocal(dates[0]);
  const dateEnd = formatDateLocal(dates[41]);
  return {
    dateStart,
    dateEnd,
    isoStart: localDateStartISO(dateStart),
    isoEnd: localDateEndISO(dateEnd),
  };
}

/** Check if two Date objects represent the same calendar date. */
export function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/** Get today as YYYY-MM-DD in local timezone. */
export function todayLocal(): string {
  return formatDateLocal(new Date());
}

/** Format a YYYY-MM-DD date for display: "Jul 1, 2026" */
export function formatDateDisplay(dateStr: string): string {
  const d = parseDateLocal(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format a YYYY-MM-DD date for short display: "Jul 1" */
export function formatDateShort(dateStr: string): string {
  const d = parseDateLocal(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Get month name and year for header: "July 2026" */
export function formatMonthYear(year: number, month: number): string {
  const d = new Date(year, month, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
