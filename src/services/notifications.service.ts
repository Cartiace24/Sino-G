import { supabase } from '../lib/supabase';
import type { NotificationRow } from '../types/database.types';
import type { NotificationWithActor } from '../types/app.types';

export const NOTIFICATION_LIMIT = 30;

/**
 * Read + read-state only. Creation happens exclusively in the database
 * triggers (migration 0009) — there is intentionally no create function here.
 */
export const notificationsService = {
  async list(userId: string, limit = NOTIFICATION_LIMIT): Promise<NotificationWithActor[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select(
        '*, actor:profiles!notifications_actor_id_fkey (id, username, display_name, avatar_url)',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as unknown as NotificationWithActor[];
  },

  async unreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) throw error;
    return count ?? 0;
  },

  async markRead(notificationId: string): Promise<NotificationRow> {
    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async markAllRead(userId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) throw error;
  },

  /** Permanently remove all of the user's notifications (own rows only). */
  async clearAll(userId: string): Promise<void> {
    const { error } = await supabase.from('notifications').delete().eq('user_id', userId);
    if (error) throw error;
  },

  /**
   * Mark a group's unread message notifications as read (e.g. when its chat
   * is opened). Scoped to type=new_message so other notification kinds are
   * untouched. RLS restricts to the caller's own rows.
   */
  async markGroupRead(userId: string, groupId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('group_id', groupId)
      .eq('type', 'new_message')
      .is('read_at', null);
    if (error) throw error;
  },
};
