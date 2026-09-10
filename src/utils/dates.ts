/** Shared local-date helpers (single source of truth for Plan/Availability).
 *  Never use toISOString() for calendar dates: UTC can be a different day
 *  than the user's wall clock (e.g. after midnight in UTC+8).
 */

export interface DayItem {
  iso: string; // YYYY-MM-DD
  dow: string; // MON
  num: string; // 3
  label: string; // MONDAY, SEPTEMBER 3
}

/** Local YYYY-MM-DD. */
export function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return localISODate(d);
}

export function nextDays(n: number): DayItem[] {
  return Array.from({ length: n }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      iso: localISODate(d),
      dow: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      num: String(d.getDate()),
      label: d
        .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        .toUpperCase(),
    };
  });
}

export function parseISODate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
}

export function toISODate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function shortDateLabel(iso: string): string {
  const { y, m, d } = parseISODate(iso);
  return new Date(y, m, d, 12)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
}

export function monthLabel(y: number, m: number): string {
  return new Date(y, m, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase();
}

export function longDateLabel(iso: string): string {
  const { y, m, d } = parseISODate(iso);
  return new Date(y, m, d, 12)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase();
}
