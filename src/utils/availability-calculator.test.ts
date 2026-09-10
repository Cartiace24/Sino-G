import { describe, expect, it } from 'vitest';
import {
  calculateGroupAvailability,
  findBestSlot,
  formatTimeInputToLabel,
  summarizeTonight,
} from './availability-calculator';
import type { AvailabilityRow } from '../types/database.types';

function row(
  user_id: string,
  start_time: string,
  end_time: string,
  status: AvailabilityRow['status'] = 'free',
): AvailabilityRow {
  return {
    id: `${user_id}-${start_time}-${status}`,
    user_id,
    date: '2026-09-10',
    start_time,
    end_time,
    status,
    created_at: '2026-09-10T00:00:00Z',
    updated_at: '2026-09-10T00:00:00Z',
  };
}

describe('calculateGroupAvailability', () => {
  it('scores free=2 and maybe=1', () => {
    const slots = calculateGroupAvailability(['a', 'b'], [
      row('a', '18:00:00', '19:00:00', 'free'),
      row('b', '18:00:00', '19:00:00', 'maybe'),
    ]);
    const s = slots.find((x) => x.start === '18:00')!;
    expect(s.free).toBe(1);
    expect(s.maybe).toBe(1);
    expect(s.score).toBe(3);
  });

  it('busy wins overlapping ranges (precedence busy > maybe > free)', () => {
    const slots = calculateGroupAvailability(['a'], [
      row('a', '18:00:00', '19:00:00', 'free'),
      row('a', '18:00:00', '19:00:00', 'busy'),
    ]);
    const s = slots.find((x) => x.start === '18:00')!;
    expect(s.busy).toBe(1);
    expect(s.score).toBe(0);
  });

  it('counts members with no rows as unknown', () => {
    const slots = calculateGroupAvailability(['a', 'b'], [row('a', '18:00:00', '19:00:00')]);
    const s = slots.find((x) => x.start === '18:00')!;
    expect(s.unknown).toBe(1);
    expect(findBestSlot(slots)?.slot.start).toBe('18:00');
  });

  it('slot is covered only when the range contains the slot start', () => {
    const slots = calculateGroupAvailability(['a'], [row('a', '18:30:00', '19:00:00')]);
    expect(slots.find((x) => x.start === '18:00')?.free).toBe(0);
    expect(slots.find((x) => x.start === '18:30')?.free).toBe(1);
  });
});

describe('findBestSlot', () => {
  it('returns null when nobody marked anything', () => {
    expect(findBestSlot(calculateGroupAvailability(['a', 'b'], []))).toBeNull();
  });

  it('prefers more free users on score ties', () => {
    // 18:00: 1 free (2pts). 19:00: 2 maybe (2pts) — same score, fewer free.
    const slots = calculateGroupAvailability(['a', 'b'], [
      row('a', '18:00:00', '18:30:00', 'free'),
      row('a', '19:00:00', '19:30:00', 'maybe'),
      row('b', '19:00:00', '19:30:00', 'maybe'),
    ]);
    expect(findBestSlot(slots)?.slot.start).toBe('18:00');
  });

  it('prefers slots from 12:00 onward over equal morning scores', () => {
    const slots = calculateGroupAvailability(['a'], [
      row('a', '09:00:00', '09:30:00', 'free'),
      row('a', '13:00:00', '13:30:00', 'free'),
    ]);
    expect(findBestSlot(slots)?.slot.start).toBe('13:00');
  });

  it('window spans the contiguous top-score run', () => {
    const slots = calculateGroupAvailability(['a'], [row('a', '18:00:00', '19:00:00', 'free')]);
    const best = findBestSlot(slots)!;
    expect(best.window.start).toBe('18:00');
    expect(best.window.end).toBe('19:00');
    expect(best.window.label).toContain('6 PM');
  });
});

describe('summarizeTonight', () => {
  it('detects free-now, free-tonight, and maybe-tonight', () => {
    const at1930 = new Date(2026, 8, 10, 19, 30);
    const out = summarizeTonight(['a', 'b', 'c'], [
      row('a', '19:00:00', '20:00:00', 'free'),
      row('b', '20:00:00', '21:00:00', 'maybe'),
      row('c', '09:00:00', '10:00:00', 'free'),
    ], at1930);
    expect(out.freeNow).toEqual(['a']);
    expect(out.freeTonight).toEqual(['a']);
    expect(out.maybeTonight).toEqual(['b']);
  });

  it('formats HH:MM labels', () => {
    expect(formatTimeInputToLabel('18:00')).toBe('6 PM');
    expect(formatTimeInputToLabel('18:30')).toBe('6:30 PM');
  });
});
