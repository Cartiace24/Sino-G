import { supabase } from '../lib/supabase';
import type { HangoutResponseValue } from '../types/database.types';
import type {
  CreateHangoutInput,
  HangoutCounts,
  HangoutWithMeta,
  ResponseWithProfile,
} from '../types/app.types';

export function countResponses(
  responses: { response: HangoutResponseValue }[],
): HangoutCounts {
  const down = responses.filter((r) => r.response === 'down').length;
  const maybe = responses.filter((r) => r.response === 'maybe').length;
  const unavailable = responses.filter((r) => r.response === 'unavailable').length;
  return { down, maybe, unavailable, total: responses.length };
}

export const hangoutsService = {
  async listForGroups(groupIds: string[], onlyActive = false): Promise<HangoutWithMeta[]> {
    if (groupIds.length === 0) return [];
    let q = supabase
      .from('hangout_requests')
      .select(
        '*, creator:profiles!hangout_requests_created_by_fkey (id, username, display_name, avatar_url), group:groups!hangout_requests_group_id_fkey (name)',
      )
      .in('group_id', groupIds)
      .order('created_at', { ascending: false })
      .limit(30);
    if (onlyActive) q = q.eq('status', 'active');
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as unknown as (HangoutWithMeta & { group: { name: string } | null })[]).map(
      (h) => ({ ...h, group_name: h.group?.name ?? 'Group' }),
    );
  },

  async get(hangoutId: string): Promise<HangoutWithMeta> {
    const { data, error } = await supabase
      .from('hangout_requests')
      .select(
        '*, creator:profiles!hangout_requests_created_by_fkey (id, username, display_name, avatar_url), group:groups!hangout_requests_group_id_fkey (name)',
      )
      .eq('id', hangoutId)
      .single();
    if (error) throw error;
    const row = data as unknown as HangoutWithMeta & { group: { name: string } | null };
    return { ...row, group_name: row.group?.name ?? 'Group' };
  },

  async create(userId: string, input: CreateHangoutInput) {
    if (!input.group_id) throw new Error('Pick a group first.');
    const { data, error } = await supabase
      .from('hangout_requests')
      .insert({
        group_id: input.group_id,
        created_by: userId,
        title: input.title?.trim() || null,
        message: input.message?.trim() || null,
        location: input.location?.trim() || null,
        proposed_time: input.proposed_time ?? null,
        expires_at: input.expires_at ?? null,
        status: 'active',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async setStatus(hangoutId: string, status: 'active' | 'closed' | 'cancelled'): Promise<void> {
    const { error } = await supabase
      .from('hangout_requests')
      .update({ status })
      .eq('id', hangoutId);
    if (error) throw error;
  },

  async responses(hangoutId: string): Promise<ResponseWithProfile[]> {
    const { data, error } = await supabase
      .from('hangout_responses')
      .select(
        '*, profile:profiles!hangout_responses_user_id_fkey (id, username, display_name, avatar_url)',
      )
      .eq('hangout_request_id', hangoutId)
      .order('responded_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ResponseWithProfile[];
  },

  /** Upsert: one row per user per hangout — changing minds updates the row. */
  async respond(hangoutId: string, userId: string, response: HangoutResponseValue): Promise<void> {
    const { error } = await supabase.from('hangout_responses').upsert(
      {
        hangout_request_id: hangoutId,
        user_id: userId,
        response,
        responded_at: new Date().toISOString(),
      },
      { onConflict: 'hangout_request_id,user_id' },
    );
    if (error) throw error;
  },

  /**
   * Nudge fellow members about a hangout via the nudge_hangout RPC
   * (migration 0010). Returns how many members were notified (excludes the
   * nudger and anyone already down). Rate-limited server-side.
   */
  async nudge(hangoutId: string): Promise<number> {
    const { data, error } = await supabase.rpc('nudge_hangout', { p_hangout_id: hangoutId });
    if (error) throw error;
    return (data as number) ?? 0;
  },
};
