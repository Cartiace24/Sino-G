import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { qk } from '../lib/queryClient';
import { notificationsService } from '../services/notifications.service';
import { friendlyError } from '../utils/errors';
import { useToast } from '../components/common/Toast';
import { useAuth } from '../contexts/AuthContext';
import type { NotificationWithActor } from '../types/app.types';

export function useNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? qk.notifications(userId) : ['notifications', 'none'],
    queryFn: () => notificationsService.list(userId!),
    enabled: Boolean(userId),
  });
}

export function useUnreadCount(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? qk.unreadCount(userId) : ['notifications', 'none', 'unread-count'],
    queryFn: () => notificationsService.unreadCount(userId!),
    enabled: Boolean(userId),
  });
}

function invalidateNotifications(qc: ReturnType<typeof useQueryClient>, userId: string) {
  qc.invalidateQueries({ queryKey: qk.notifications(userId) });
  qc.invalidateQueries({ queryKey: qk.unreadCount(userId) });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  return useMutation({
    mutationFn: (notificationId: string) => notificationsService.markRead(notificationId),
    onMutate: async (notificationId) => {
      // Optimistic: flip the row + drop the badge immediately.
      if (user) {
        await qc.cancelQueries({ queryKey: qk.notifications(user.id) });
        const prev = qc.getQueryData<NotificationWithActor[]>(qk.notifications(user.id));
        if (prev) {
          qc.setQueryData<NotificationWithActor[]>(
            qk.notifications(user.id),
            prev.map((n) => (n.id === notificationId && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)),
          );
          const unread = qc.getQueryData<number>(qk.unreadCount(user.id));
          if (typeof unread === 'number' && prev.some((n) => n.id === notificationId && !n.read_at)) {
            qc.setQueryData<number>(qk.unreadCount(user.id), Math.max(0, unread - 1));
          }
        }
      }
    },
    onError: (err) => {
      if (user) invalidateNotifications(qc, user.id);
      toast(friendlyError(err, 'Could not mark that as read.'));
    },
    onSettled: () => {
      if (user) invalidateNotifications(qc, user.id);
    },
  });
}

export function useMarkAllNotificationsRead() {  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  return useMutation({
    mutationFn: () => notificationsService.markAllRead(user!.id),
    onMutate: async () => {
      if (user) {
        await qc.cancelQueries({ queryKey: qk.notifications(user.id) });
        const prev = qc.getQueryData<NotificationWithActor[]>(qk.notifications(user.id));
        if (prev) {
          const now = new Date().toISOString();
          qc.setQueryData<NotificationWithActor[]>(
            qk.notifications(user.id),
            prev.map((n) => (n.read_at ? n : { ...n, read_at: now })),
          );
          qc.setQueryData<number>(qk.unreadCount(user.id), 0);
        }
      }
    },
    onError: (err) => {
      if (user) invalidateNotifications(qc, user.id);
      toast(friendlyError(err, 'Could not mark all as read.'));
    },
    onSettled: () => {
      if (user) invalidateNotifications(qc, user.id);
    },
  });
}

export function useClearNotifications() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  return useMutation({
    mutationFn: () => notificationsService.clearAll(user!.id),
    onMutate: async () => {
      if (user) {
        await qc.cancelQueries({ queryKey: qk.notifications(user.id) });
        qc.setQueryData<NotificationWithActor[]>(qk.notifications(user.id), []);
        qc.setQueryData<number>(qk.unreadCount(user.id), 0);
      }
    },
    onSuccess: () => {
      toast('Inbox cleared.');
    },
    onError: (err) => {
      if (user) invalidateNotifications(qc, user.id);
      toast(friendlyError(err, 'Could not clear notifications.'));
    },
    onSettled: () => {
      if (user) invalidateNotifications(qc, user.id);
    },
  });
}

/**
 * Single app-wide subscription, mounted once in AppShell. Filtered to the
 * signed-in user's rows only. INSERT (new notification) and UPDATE (read on
 * another device) both refetch the inbox + badge. Resubscribes (reconnects)
 * refetch once for freshness. Always cleaned up on logout/unmount/user
 * change — exactly one channel while authed.
 */
export function useRealtimeNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifs:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => invalidateNotifications(qc, userId),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') invalidateNotifications(qc, userId);
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}
