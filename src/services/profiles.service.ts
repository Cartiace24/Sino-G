import { supabase } from '../lib/supabase';
import type { ProfileRow } from '../types/database.types';

const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

export function validateUsername(username: string): string | null {
  if (!USERNAME_RE.test(username.trim()))
    return 'Usernames need 3–24 letters, numbers, or underscores.';
  return null;
}

export const profilesService = {
  async getMyProfile(userId: string): Promise<ProfileRow | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async isUsernameAvailable(username: string, exceptUserId?: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.trim());
    if (error) throw error;
    if (data.length === 0) return true;
    return exceptUserId != null && data.every((r) => r.id === exceptUserId);
  },

  async updateProfile(
    userId: string,
    patch: { username?: string; display_name?: string; avatar_url?: string | null },
  ): Promise<ProfileRow> {
    if (patch.username) {
      const bad = validateUsername(patch.username);
      if (bad) throw new Error(bad);
      const free = await this.isUsernameAvailable(patch.username, userId);
      if (!free) throw new Error('That username is taken. Try another one.');
    }
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** First-time setup right after registration (profile row exists via trigger). */
  async completeOnboarding(
    userId: string,
    input: { username: string; display_name: string; avatar_url?: string | null },
  ): Promise<ProfileRow> {
    if (!input.display_name.trim()) throw new Error('Tell the barkada your name first.');
    return this.updateProfile(userId, {
      username: input.username.trim(),
      display_name: input.display_name.trim(),
      avatar_url: input.avatar_url ?? undefined,
    });
  },
};
