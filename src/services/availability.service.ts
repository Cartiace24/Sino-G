import { supabase } from '../lib/supabase';
import type { AvailabilityRow, Database } from '../types/database.types';
import type { AvailabilityInput } from '../types/app.types';

type AvailabilityUpdate = Database['public']['Tables']['availability']['Update'];

function toDbTime(hhmm: string): string {
  // "18:00" -> "18:00:00"
  return hhmm.length === 5 ? `${hhmm}:00` : hhmm;
}

export function validateAvailabilityInput(input: AvailabilityInput): string | null {
  if (!input.date) return 'Pick a date first.';
  if (!input.start_time || !input.end_time) return 'Pick a start and end time.';
  if (toDbTime(input.end_time) <= toDbTime(input.start_time))
    return 'End time has to be later than start time.';
  return null;
}

export const availabilityService = {
  async listMine(userId: string, from: string, to: string): Promise<AvailabilityRow[]> {
    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .eq('user_id', userId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  /** Everyone's rows for one date (RLS limits to shared-group members). */
  async listForDate(userIds: string[], date: string): Promise<AvailabilityRow[]> {
    if (userIds.length === 0) return [];
    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .in('user_id', userIds)
      .eq('date', date)
      .order('start_time', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async save(userId: string, input: AvailabilityInput): Promise<AvailabilityRow> {
    const bad = validateAvailabilityInput(input);
    if (bad) throw new Error(bad);
    const { data, error } = await supabase
      .from('availability')
      .insert({
        user_id: userId,
        date: input.date,
        start_time: toDbTime(input.start_time),
        end_time: toDbTime(input.end_time),
        status: input.status,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: Partial<AvailabilityInput>): Promise<AvailabilityRow> {
    const dbPatch: AvailabilityUpdate = {};
    if (patch.date) dbPatch.date = patch.date;
    if (patch.start_time) dbPatch.start_time = toDbTime(patch.start_time);
    if (patch.end_time) dbPatch.end_time = toDbTime(patch.end_time);
    if (patch.status) dbPatch.status = patch.status;
    if (
      dbPatch.start_time &&
      dbPatch.end_time &&
      dbPatch.end_time <= dbPatch.start_time
    ) {
      throw new Error('End time has to be later than start time.');
    }
    const { data, error } = await supabase
      .from('availability')
      .update({ ...dbPatch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('availability').delete().eq('id', id);
    if (error) throw error;
  },
};
