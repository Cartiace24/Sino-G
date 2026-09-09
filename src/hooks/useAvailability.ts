import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk } from '../lib/queryClient';
import { availabilityService } from '../services/availability.service';
import { groupsService } from '../services/groups.service';
import {
  calculateGroupAvailability,
  findBestSlot,
  summarizeTonight,
} from '../utils/availability-calculator';

/** Local YYYY-MM-DD. Never use toISOString() for calendar dates: UTC can be a
 *  different day than the user's wall clock (e.g. after midnight in UTC+8). */
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

export function useMyAvailability(userId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: userId ? qk.myAvailability(userId, from, to) : ['my-availability', 'none'],
    queryFn: () => availabilityService.listMine(userId!, from, to),
    enabled: Boolean(userId),
  });
}

/**
 * Members + that date's rows + computed slots, memoized.
 * Realtime: availability changes refetch via the Plan/Today subscriptions.
 * Range is minutes-since-midnight; defaults to the full 08:00–23:00 day.
 */
export interface DayRange {
  start: number;
  end: number;
}

export const FULL_DAY: DayRange = { start: 8 * 60, end: 23 * 60 };

export function useGroupAvailability(groupId: string | undefined, date: string, range: DayRange = FULL_DAY) {
  const membersQ = useQuery({
    queryKey: groupId ? qk.groupMembers(groupId) : ['group-members', 'none'],
    queryFn: () => groupsService.members(groupId!),
    enabled: Boolean(groupId),
  });

  const memberIds = useMemo(
    () => (membersQ.data ?? []).map((m) => m.user_id),
    [membersQ.data],
  );
  // The member set is part of the key: without it, a membership change would
  // leave the previous members' rows cached under an identical key.
  const memberHash = useMemo(() => [...memberIds].sort().join(','), [memberIds]);

  const rowsQ = useQuery({
    queryKey: groupId ? [...qk.groupAvailability(groupId, date), memberHash] : ['group-availability', 'none'],
    queryFn: () => availabilityService.listForDate(memberIds, date),
    enabled: Boolean(groupId) && memberIds.length > 0,
  });

  const computed = useMemo(() => {
    const slots = calculateGroupAvailability(memberIds, rowsQ.data ?? [], range.start, range.end);
    return { slots, best: findBestSlot(slots) };
  }, [memberIds, rowsQ.data, range.start, range.end]);

  return { membersQ, rowsQ, memberIds, ...computed };
}

/** Who's free right now / tonight across all of the user's groups. */
export function useTonight(userId: string | undefined, groupIds: string[], date: string) {
  const membersQ = useQuery({
    queryKey:
      userId && groupIds.length > 0
        ? (['tonight-members', userId, ...[...groupIds].sort()] as unknown as readonly unknown[])
        : ['tonight-members', 'none'],
    queryFn: async () => {
      const lists = await Promise.all(groupIds.map((g) => groupsService.members(g)));
      const seen = new Map<string, { user_id: string; display_name: string; avatar_url: string | null }>();
      for (const l of lists)
        for (const m of l)
          seen.set(m.user_id, {
            user_id: m.user_id,
            display_name: m.profile.display_name,
            avatar_url: m.profile.avatar_url,
          });
      return [...seen.values()];
    },
    enabled: Boolean(userId) && groupIds.length > 0,
  });

  const ids = useMemo(() => (membersQ.data ?? []).map((m) => m.user_id), [membersQ.data]);

  const people = useMemo(() => {
    const map: Record<string, { name: string; photo: string | null }> = {};
    for (const m of membersQ.data ?? []) map[m.user_id] = { name: m.display_name, photo: m.avatar_url };
    return map;
  }, [membersQ.data]);

  // Same staleness guard as above: the member set is part of the key.
  const memberHash = useMemo(() => [...ids].sort().join(','), [ids]);

  const rowsQ = useQuery({
    queryKey: userId ? [...qk.tonightStatus(userId, date), memberHash] : ['tonight', 'none'],
    queryFn: () => availabilityService.listForDate(ids, date),
    enabled: Boolean(userId) && ids.length > 0,
  });

  const summary = useMemo(
    () => summarizeTonight(ids, rowsQ.data ?? []),
    [ids, rowsQ.data],
  );

  return { membersQ, rowsQ, memberIds: ids, people, summary };
}
