import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { qk } from '../lib/queryClient';
import { chatService, type ChatCursor } from '../services/chat.service';
import { friendlyError } from '../utils/errors';
import { useToast } from '../components/common/Toast';
import { useAuth } from '../contexts/AuthContext';

/**
 * Newest page first from the server, exposed oldest→newest for rendering.
 * Cursor pagination on (created_at, id): concurrent inserts can't duplicate
 * or skip rows. Realtime only invalidates — it never splices rows in, so a
 * live INSERT can't collide with an in-flight page fetch.
 */
export function useGroupMessages(groupId: string | undefined) {
  return useInfiniteQuery({
    queryKey: groupId ? qk.groupMessages(groupId) : ['group-messages', 'none'],
    queryFn: ({ pageParam }: { pageParam: ChatCursor | null }) =>
      chatService.getMessages(groupId!, pageParam ?? undefined),
    initialPageParam: null as ChatCursor | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      const oldest = lastPage.messages[lastPage.messages.length - 1];
      return { created_at: oldest.created_at, id: oldest.id } as ChatCursor;
    },
    enabled: Boolean(groupId),
    staleTime: 15_000,
  });
}

export function useSendMessage(groupId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  return useMutation({
    // No optimistic insert: the mutation refetch plus the realtime event
    // converge on the same single row, so doubles are impossible by design.
    mutationFn: (content: string) => chatService.sendMessage(groupId!, user!.id, content),
    onSuccess: () => {
      if (groupId) qc.invalidateQueries({ queryKey: qk.groupMessages(groupId) });
    },
    onError: (err) => toast(friendlyError(err, 'Could not send that.')),
  });
}

export function useDeleteMessage(groupId: string | undefined) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (messageId: string) => chatService.deleteMessage(messageId),
    onSuccess: () => {
      if (groupId) qc.invalidateQueries({ queryKey: qk.groupMessages(groupId) });
    },
    onError: (err) => toast(friendlyError(err, 'Could not delete that message.')),
  });
}

/**
 * One scoped channel per open chat: group_id=eq.<id> for INSERT and DELETE.
 * (No UPDATE path exists in V1.) Invalidates the message pages; React Query
 * dedupes simultaneous refetches. Always cleaned up on unmount/group change.
 */
export function useRealtimeGroupChat(groupId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`chat:${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
        () => {
          qc.invalidateQueries({ queryKey: qk.groupMessages(groupId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, qc]);
}
