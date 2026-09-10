import { useEffect } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { qk } from '../lib/queryClient';
import { chatService, type ChatCursor } from '../services/chat.service';
import { friendlyError } from '../utils/errors';
import { useToast } from '../components/common/Toast';
import { useAuth } from '../contexts/AuthContext';
import type { MessageWithSender } from '../types/app.types';

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

type MessagesPage = { messages: MessageWithSender[]; hasMore: boolean };

export function useSendMessage(groupId: string | undefined) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const toast = useToast();
  return useMutation({
    mutationFn: (content: string) => chatService.sendMessage(groupId!, user!.id, content),
    onMutate: async (content) => {
      if (!groupId || !user) return undefined;
      const key = qk.groupMessages(groupId);
      await qc.cancelQueries({ queryKey: key });
      const previous =
        qc.getQueryData<InfiniteData<MessagesPage>>(key);
      // Optimistic row (newest-first store: prepend to page 0). Temp id can
      // never collide with a server uuid; onSuccess swaps it for the real row,
      // and onSettled refetches canonical — so realtime + refetch can't double it.
      const optimistic: MessageWithSender = {
        id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        group_id: groupId,
        sender_id: user.id,
        content: content.trim(),
        created_at: new Date().toISOString(),
        sender: {
          id: user.id,
          username: profile?.username ?? '',
          display_name: profile?.display_name ?? 'You',
          avatar_url: profile?.avatar_url ?? null,
        },
      };
      qc.setQueryData<InfiniteData<MessagesPage>>(key, (old) => {
        if (!old || old.pages.length === 0) {
          return { pages: [{ messages: [optimistic], hasMore: false }], pageParams: [null] };
        }
        const [first, ...rest] = old.pages;
        return {
          ...old,
          pages: [{ ...first, messages: [optimistic, ...first.messages] }, ...rest],
        };
      });
      return { previous, tempId: optimistic.id };
    },
    onSuccess: (real, _vars, ctx) => {
      if (!groupId || !ctx) return;
      const key = qk.groupMessages(groupId);
      // Swap the temp row for the server row (no-op if a realtime refetch
      // already replaced the cache — then the server row is already there).
      qc.setQueryData<InfiniteData<MessagesPage>>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((pg) => ({
            ...pg,
            messages: pg.messages.map((m) => (m.id === ctx.tempId ? real : m)),
          })),
        };
      });
    },
    onError: (err, _vars, ctx) => {
      // Roll back to pre-send snapshot so a failed send never lingers.
      if (groupId && ctx?.previous) {
        qc.setQueryData(qk.groupMessages(groupId), ctx.previous);
      }
      toast(friendlyError(err, 'Could not send that.'));
    },
    onSettled: () => {
      // Converge with server + realtime (deduped by React Query).
      if (groupId) qc.invalidateQueries({ queryKey: qk.groupMessages(groupId) });
    },
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
