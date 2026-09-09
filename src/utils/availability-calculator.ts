/**
 * Group availability algorithm (Sino G core).
 *
 * Intervals are generated temporarily for calculation only — never stored.
 * Scoring: FREE = 2, MAYBE = 1, BUSY = 0.
 * Tie-breaks: (1) more FREE users, (2) longer continuous top-score window,
 * (3) earlier reasonable time (prefer slots from 12:00 onward, then earliest).
 */
import type { AvailabilityRow, AvailabilityStatus } from '../types/database.types';

export const SCORE: Record<AvailabilityStatus, number> = { free: 2, maybe: 1, busy: 0 };

export interface SlotCoverage {
  userId: string;
  status: AvailabilityStatus | 'unknown';
}

export interface TimeSlot {
  /** "18:00" 24h label */
  start: string;
  /** "18:30" */
  end: string;
  /** Display label, e.g. "6 PM" / "6:30 PM" */
  label: string;
  score: number;
  free: number;
  maybe: number;
  busy: number;
  unknown: number;
  coverage: SlotCoverage[];
}

export interface BestWindow {
  start: string;
  end: string;
  label: string;
  score: number;
  free: number;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function toLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

const PRECEDENCE: Record<AvailabilityStatus, number> = { busy: 3, maybe: 2, free: 1 };

/**
 * Build 30-minute slots for a date and score each one.
 * @param memberIds every group member (all counted, even with no rows)
 * @param rows availability rows for the date (any members)
 * @param dayStart opening bound in minutes (default 08:00)
 * @param dayEnd closing bound in minutes (default 23:00)
 */
export function calculateGroupAvailability(
  memberIds: string[],
  rows: AvailabilityRow[],
  dayStart = 8 * 60,
  dayEnd = 23 * 60,
  stepMin = 30,
): TimeSlot[] {
  const byUser = new Map<string, AvailabilityRow[]>();
  for (const r of rows) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }

  const slots: TimeSlot[] = [];
  for (let s = dayStart; s < dayEnd; s += stepMin) {
    const e = s + stepMin;
    const coverage: SlotCoverage[] = memberIds.map((userId) => {
      const own = byUser.get(userId) ?? [];
      // A range covers the slot if it contains the slot start.
      const covering = own.filter(
        (r) => toMinutes(r.start_time) <= s && toMinutes(r.end_time) > s,
      );
      if (covering.length === 0) return { userId, status: 'unknown' as const };
      covering.sort((a, b) => PRECEDENCE[b.status] - PRECEDENCE[a.status]);
      return { userId, status: covering[0].status };
    });

    const free = coverage.filter((c) => c.status === 'free').length;
    const maybe = coverage.filter((c) => c.status === 'maybe').length;
    const busy = coverage.filter((c) => c.status === 'busy').length;
    const unknown = coverage.filter((c) => c.status === 'unknown').length;

    slots.push({
      start: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`,
      end: `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`,
      label: toLabel(s),
      score: free * SCORE.free + maybe * SCORE.maybe,
      free,
      maybe,
      busy,
      unknown,
      coverage,
    });
  }
  return slots;
}

/** Longest contiguous run of equal-score slots containing `index`. */
function windowRun(slots: TimeSlot[], index: number): { startIdx: number; endIdx: number } {
  const target = slots[index].score;
  let a = index;
  let b = index;
  while (a - 1 >= 0 && slots[a - 1].score === target) a--;
  while (b + 1 < slots.length && slots[b + 1].score === target) b++;
  return { startIdx: a, endIdx: b };
}

/**
 * Pick the best slot. Returns null when nobody marked anything
 * (every slot scores 0 with zero free/maybe).
 */
export function findBestSlot(slots: TimeSlot[]): {
  slot: TimeSlot;
  index: number;
  window: BestWindow;
} | null {
  const viable = slots.filter((s) => s.score > 0);
  if (viable.length === 0) return null;

  const top = Math.max(...slots.map((s) => s.score));
  const candidates = slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.score === top);

  // Prefer afternoon/evening ("reasonable time") before falling back to morning.
  const reasonable = candidates.filter(({ slot }) => toMinutes(slot.start) >= 12 * 60);
  const pool = reasonable.length > 0 ? reasonable : candidates;

  const ranked = pool
    .map(({ slot, index }) => {
      const run = windowRun(slots, index);
      return { slot, index, runLen: run.endIdx - run.startIdx + 1, run };
    })
    .sort(
      (a, b) =>
        b.slot.free - a.slot.free || b.runLen - a.runLen || a.index - b.index,
    );

  const winner = ranked[0];
  const runSlots = slots.slice(winner.run.startIdx, winner.run.endIdx + 1);
  return {
    slot: winner.slot,
    index: winner.index,
    window: {
      start: runSlots[0].start,
      end: runSlots[runSlots.length - 1].end,
      label: `${runSlots[0].label} – ${toLabel(toMinutes(runSlots[runSlots.length - 1].end))}`,
      score: winner.slot.score,
      free: winner.slot.free,
    },
  };
}

/** "Tonight" = evening window from 18:00 onward (local). */
export function summarizeTonight(
  memberIds: string[],
  rows: AvailabilityRow[],
  now = new Date(),
): {
  freeNow: string[];
  freeTonight: string[];
  maybeTonight: string[];
} {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const eveningMin = 18 * 60;
  const freeNow: string[] = [];
  const freeTonight: string[] = [];
  const maybeTonight: string[] = [];

  for (const userId of memberIds) {
    const own = rows.filter((r) => r.user_id === userId);
    const covers = (status: AvailabilityStatus, at: number) =>
      own.some(
        (r) => r.status === status && toMinutes(r.start_time) <= at && toMinutes(r.end_time) > at,
      );
    const overlapsEvening = (status: AvailabilityStatus) =>
      own.some(
        (r) => r.status === status && toMinutes(r.end_time) > eveningMin,
      );
    if (covers('free', nowMin)) freeNow.push(userId);
    if (overlapsEvening('free')) freeTonight.push(userId);
    else if (overlapsEvening('maybe')) maybeTonight.push(userId);
  }
  return { freeNow, freeTonight, maybeTonight };
}

export function formatTimeInputToLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return toLabel(h * 60 + m);
}
