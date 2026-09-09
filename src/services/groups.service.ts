import { supabase } from '../lib/supabase';
import type { GroupRow, MemberRole } from '../types/database.types';
import type { CreateGroupInput, GroupWithMembership, MemberWithProfile } from '../types/app.types';
import { storageService } from './storage.service';

/** True when PostgREST reports an unknown RPC function (migration not applied). */
function isMissingFunction(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const o = err as { code?: unknown; message?: unknown };
  if (o.code === 'PGRST202') return true;
  return typeof o.message === 'string' && /could not find the function/i.test(o.message);
}

export const groupsService = {
  /** All groups the user belongs to, with role + member counts. */
  async listMine(userId: string): Promise<GroupWithMembership[]> {
    const { data: memberships, error: mErr } = await supabase
      .from('group_members')
      .select('role, group_id, groups (*)')
      .eq('user_id', userId);
    if (mErr) throw mErr;

    const rows = (memberships ?? []).filter((m) => m.groups !== null) as unknown as {
      role: MemberRole;
      group_id: string;
      groups: GroupRow;
    }[];
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.group_id);
    const { data: allMembers, error: cErr } = await supabase
      .from('group_members')
      .select('group_id')
      .in('group_id', ids);
    if (cErr) throw cErr;

    const counts = new Map<string, number>();
    for (const m of allMembers ?? []) counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);

    return rows.map((r) => ({
      ...r.groups,
      my_role: r.role,
      member_count: counts.get(r.group_id) ?? 1,
    }));
  },

  async get(groupId: string): Promise<GroupRow> {
    const { data, error } = await supabase.from('groups').select('*').eq('id', groupId).single();
    if (error) throw error;
    return data;
  },

  /**
   * Primary path: create_group RPC (migration 0005). The server takes the
   * author from the JWT itself, so no client-supplied id can mismatch the
   * RLS check. Falls back to a direct INSERT on projects where 0005 has not
   * been applied yet (detected via PGRST202 / "function not found").
   */
  async create(userId: string, input: CreateGroupInput): Promise<GroupRow> {
    const name = input.name.trim();
    if (!name) throw new Error('Give your group a name first.');

    // Fail fast with a clear message if there is no JWT to send — otherwise
    // PostgREST answers with a cryptic 42501 (auth.uid() is NULL server-side).
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('NOT_AUTHENTICATED: no user session on this device. Log in and retry.');
    }

    const description = input.description?.trim() || null;
    try {
      const { data, error } = await supabase
        .rpc('create_group', { p_name: name, p_description: description })
        .single();
      if (error) throw error;
      return await this.attachAvatarIfNeeded(data, input.avatarFile);
    } catch (err) {
      if (!isMissingFunction(err)) throw err;
      return this.createViaInsert(userId, { name, description });
    }
  },

  /** Legacy path: direct INSERT (requires groups_insert policy + 0004 trigger). */
  async createViaInsert(
    userId: string,
    input: { name: string; description?: string | null; avatarFile?: File | null },
  ): Promise<GroupRow> {
    const name = input.name.trim();
    const { data, error } = await supabase
      .from('groups')
      .insert({
        name,
        description: input.description?.trim() || null,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;

    // Owner membership is added by the DB trigger; avatar upload needs the id.
    return this.attachAvatarIfNeeded(data, input.avatarFile ?? null);
  },

  async attachAvatarIfNeeded(group: GroupRow, avatarFile?: File | null): Promise<GroupRow> {
    if (!avatarFile) return group;
    const url = await storageService.uploadGroupAvatar(group.id, avatarFile);
    const { data: updated, error: uErr } = await supabase
      .from('groups')
      .update({ avatar_url: url })
      .eq('id', group.id)
      .select()
      .single();
    if (uErr) throw uErr;
    return updated;
  },

  /** Validates + joins atomically via the join_group_with_code RPC. */
  async joinByCode(code: string): Promise<string> {
    const clean = code.trim().toUpperCase();
    if (!clean) throw new Error('INVITE_REQUIRED');
    const { data, error } = await supabase.rpc('join_group_with_code', { p_code: clean });
    if (error) throw error;
    return data as string;
  },

  async members(groupId: string): Promise<MemberWithProfile[]> {
    const { data, error } = await supabase
      .from('group_members')
      .select('id, group_id, user_id, role, joined_at, profile:profiles!group_members_user_id_fkey (id, username, display_name, avatar_url)')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as MemberWithProfile[];
  },

  async update(groupId: string, patch: { name?: string; description?: string | null; avatar_url?: string | null }): Promise<GroupRow> {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error('Give your group a name first.');
    const { data, error } = await supabase
      .from('groups')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', groupId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(groupId: string): Promise<void> {
    const { error } = await supabase.from('groups').delete().eq('id', groupId);
    if (error) throw error;
  },

  async leave(groupId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async removeMember(groupId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async makeAdmin(groupId: string, userId: string, role: MemberRole): Promise<void> {
    const { error } = await supabase
      .from('group_members')
      .update({ role })
      .eq('group_id', groupId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  /** Secondary invites for a group (managers list; members can read per RLS). */
  async invites(groupId: string) {
    const { data, error } = await supabase
      .from('group_invites')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  /** Mint a secondary shareable invite with optional expiry / use cap. */
  async createInvite(
    groupId: string,
    userId: string,
    opts: { expires_at?: string | null; max_uses?: number | null } = {},
  ) {
    const { data, error } = await supabase
      .from('group_invites')
      .insert({
        group_id: groupId,
        invited_by: userId,
        expires_at: opts.expires_at ?? null,
        max_uses: opts.max_uses ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Revoke a secondary invite by deleting its row (managers only, per RLS).
   *  Revoked codes fail joining with INVITE_NOT_FOUND. */
  async deleteInvite(inviteId: string): Promise<void> {
    const { error } = await supabase.from('group_invites').delete().eq('id', inviteId);
    if (error) throw error;
  },
};
