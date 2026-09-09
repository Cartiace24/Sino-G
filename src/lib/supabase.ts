import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fail fast with a helpful message instead of cryptic network errors.
  // Copy .env.example -> .env.local and fill in your Supabase project values.
  console.error(
    '[Sino G] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
  );
}

export const supabase = createClient<Database>(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey && !url.includes('placeholder'));
}
