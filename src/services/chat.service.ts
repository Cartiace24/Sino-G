import { supabase } from '../lib/supabase';
import type { ChatMessageRow } from '../types/database.types';
import type { MessageWithSender } from '../types/app.types';

export const CHAT_PAGE_SIZE = 50;
export const CHAT_MAX_LENGTH = 1000;

export interface ChatCursor {
  created_at: string;
  id: string;
}

const SENDER_SELECT =
  'sender:profiles!group_messages_sender_id_fkey (id, username, display_name, avatar_url)';

function toMessage(row: ChatMessageRow & { sender: MessageWithSender['sender'] }): MessageWithSender {
  return row as MessageWithSender;
}

export const chatService = {
  /**
   * Newest page first (desc). Pass the oldest loaded message as cursor for
   * the next page. Keyset on (created_at, id) — stable under concurrent
   * inserts, no duplicates, no gaps. `hasMore` comes from a +1 probe row.
   */
  async getMessages(
    groupId: string,
    cursor?: ChatCursor,
    limit = CHAT_PAGE_SIZE,
  ): Promise<{ messages: MessageWithSender[]; hasMore: boolean }> {
    let q = supabase
      .from('group_messages')
      .select(`*, ${SENDER_SELECT}`)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    if (cursor) {
      q = q.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
      );
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as (ChatMessageRow & { sender: MessageWithSender['sender'] })[];
    return { messages: rows.slice(0, limit).map(toMessage), hasMore: rows.length > limit };
  },

  /** Sender comes from the authenticated session; RLS pins sender_id anyway. */
  async sendMessage(groupId: string, userId: string, raw: string): Promise<MessageWithSender> {
    const content = raw.trim();
    if (!content) throw new Error('Write something first.');
    if (content.length > CHAT_MAX_LENGTH) {
      throw new Error(`Keep it under ${CHAT_MAX_LENGTH} characters.`);
    }
    const { data, error } = await supabase
      .from('group_messages')
      .insert({ group_id: groupId, sender_id: userId, content })
      .select(`*, ${SENDER_SELECT}`)
      .single();
    if (error) throw error;
    return toMessage(data as unknown as ChatMessageRow & { sender: MessageWithSender['sender'] });
  },

  /** RLS allows deleting only your own messages. */
  async deleteMessage(messageId: string): Promise<void> {
    const { error } = await supabase.from('group_messages').delete().eq('id', messageId);
    if (error) throw error;
  },
};
