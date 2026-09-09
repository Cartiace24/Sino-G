import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { qk } from '../lib/queryClient';
import { groupsService } from '../services/groups.service';

export function useMyGroups(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? qk.groups(userId) : ['groups', 'none'],
    queryFn: () => groupsService.listMine(userId!),
    enabled: Boolean(userId),
  });
}

export function useGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: groupId ? qk.group(groupId) : ['group', 'none'],
    queryFn: () => groupsService.get(groupId!),
    enabled: Boolean(groupId),
  });
}

export function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: groupId ? qk.groupMembers(groupId) : ['group-members', 'none'],
    queryFn: () => groupsService.members(groupId!),
    enabled: Boolean(groupId),
  });
}

/** Invalidate everything a membership/row change can visibly affect. */
function invalidateGroupCaches(qc: ReturnType<typeof useQueryClient>, groupId: string) {
  // Member list + single-group header.
  qc.invalidateQueries({ queryKey: qk.groupMembers(groupId) });
  qc.invalidateQueries({ queryKey: qk.group(groupId) });
  // My-groups lists (member counts, visibility) on Today / Groups / Me.
  qc.invalidateQueries({ queryKey: ['groups'] });
  // Tonight's member set derives from group membership.
  qc.invalidateQueries({ queryKey: ['tonight-members'] });
}

/**
 * Live membership for ONE group (Group Detail / Plan screens).
 * Filtered channel: INSERT (join), DELETE (leave/remove), UPDATE (role
 * change) arrive scoped to this group. Group-row UPDATE/DELETE (rename,
 * delete) arrives via the PK filter — a deleted group refetches to an RLS
 * denial, which the detail page already renders as its "can't open" state.
 * Requires migration 0006 (publication + REPLICA IDENTITY FULL, without
 * which filtered DELETEs are never delivered).
 */
export function useRealtimeGroup(groupId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`group:${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` },
        () => invalidateGroupCaches(qc, groupId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` },
        () => invalidateGroupCaches(qc, groupId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, qc]);
}

/**
 * Live membership for the GROUP LISTS (Today / Groups / Me screens).
 * One unfiltered channel — Postgres + RLS already restrict delivery to rows
 * this user may SELECT (fellow members of their own groups), so traffic is
 * exactly their groups' membership churn. Mounted pages are route-exclusive,
 * so at most one such channel is ever active.
 */
export function useRealtimeGroupsList() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel('groups:list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members' },
        (payload) => {
          const row = (payload.new ?? payload.old ?? {}) as { group_id?: string };
          if (row.group_id) invalidateGroupCaches(qc, row.group_id);
          else {
            qc.invalidateQueries({ queryKey: ['groups'] });
            qc.invalidateQueries({ queryKey: ['group-members'] });
            qc.invalidateQueries({ queryKey: ['tonight-members'] });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'groups' },
        () => {
          qc.invalidateQueries({ queryKey: ['groups'] });
          qc.invalidateQueries({ queryKey: ['group'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
