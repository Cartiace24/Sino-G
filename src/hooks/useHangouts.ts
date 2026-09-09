import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { qk } from '../lib/queryClient';
import { hangoutsService } from '../services/hangouts.service';

/**
 * One realtime channel per group: new/changed hangout requests AND
 * responses invalidate the cached lists. Single subscription per mount,
 * always cleaned up — no duplicates.
 */
export function useRealtimeHangouts(groupIds: string[]) {
  const qc = useQueryClient();
  const key = [...groupIds].sort().join(',');

  useEffect(() => {
    if (groupIds.length === 0) return;
    const channel = supabase
      .channel(`hangouts:${key}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hangout_requests' },
        () => {
          for (const g of groupIds) qc.invalidateQueries({ queryKey: qk.hangouts(g) });
          const uid = qc.getQueryData<string>(['auth-user-id']);
          if (uid) qc.invalidateQueries({ queryKey: qk.myHangouts(uid) });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hangout_responses' },
        (payload) => {
          const row = payload.new as { hangout_request_id?: string };
          const old = payload.old as { hangout_request_id?: string };
          const id = row.hangout_request_id ?? old.hangout_request_id;
          if (id) qc.invalidateQueries({ queryKey: qk.hangoutResponses(id) });
          // The G? list's per-hangout down-counts derive from responses —
          // without this they stay frozen after first load.
          qc.invalidateQueries({ queryKey: ['hangout-counts'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Realtime refetch for group availability changes (Plan screen). */
export function useRealtimeAvailability(groupId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`avail:${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'availability' },
        () => {
          qc.invalidateQueries({ queryKey: ['group-availability', groupId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, qc]);
}

export function useGroupHangouts(groupId: string | undefined, onlyActive = false) {
  return useQuery({
    queryKey: groupId ? [...qk.hangouts(groupId), onlyActive ? 'active' : 'all'] : ['hangouts', 'none'],
    queryFn: () => hangoutsService.listForGroups([groupId!], onlyActive),
    enabled: Boolean(groupId),
  });
}

export function useMyHangouts(userId: string | undefined, groupIds: string[]) {
  const qc = useQueryClient();
  useEffect(() => {
    if (userId) qc.setQueryData(['auth-user-id'], userId);
  }, [userId, qc]);

  // The group set is part of the key: joining a group must refetch the list
  // instead of serving the pre-join snapshot cached under the same user key.
  const groupHash = [...groupIds].sort().join(',');
  return useQuery({
    queryKey: userId ? [...qk.myHangouts(userId), groupHash] : ['my-hangouts', 'none'],
    queryFn: () => hangoutsService.listForGroups(groupIds, true),
    enabled: Boolean(userId) && groupIds.length > 0,
  });
}

export function useHangoutDetail(hangoutId: string | undefined) {
  const qc = useQueryClient();

  const hangoutQ = useQuery({
    queryKey: hangoutId ? qk.hangout(hangoutId) : ['hangout', 'none'],
    queryFn: () => hangoutsService.get(hangoutId!),
    enabled: Boolean(hangoutId),
  });

  const responsesQ = useQuery({
    queryKey: hangoutId ? qk.hangoutResponses(hangoutId) : ['hangout-responses', 'none'],
    queryFn: () => hangoutsService.responses(hangoutId!),
    enabled: Boolean(hangoutId),
    refetchInterval: 15_000, // fallback if realtime drops
  });

  useEffect(() => {
    if (!hangoutId) return;
    const channel = supabase
      .channel(`hangout:${hangoutId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hangout_responses',
          filter: `hangout_request_id=eq.${hangoutId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: qk.hangoutResponses(hangoutId) });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hangout_requests', filter: `id=eq.${hangoutId}` },
        () => {
          qc.invalidateQueries({ queryKey: qk.hangout(hangoutId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hangoutId, qc]);

  return { hangoutQ, responsesQ };
}
