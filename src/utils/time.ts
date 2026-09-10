import { formatTimeInputToLabel } from './availability-calculator';

/** Relative timestamps for the notification inbox. No dependencies. */
export function timeAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Human hangout label shared by the create form and edit message regen:
 *  "Tonight · 7:00 PM", "Tomorrow · 2:00 PM", or "Sat, Sep 12 · 7:30 PM". */
export function describeHangoutWhen(d: Date, now = new Date()): string {
  const time = formatTimeInputToLabel(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day =
    localDay(d) === localDay(now)
      ? 'Tonight'
      : localDay(d) === localDay(tomorrow)
        ? 'Tomorrow'
        : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${time}`;
}
