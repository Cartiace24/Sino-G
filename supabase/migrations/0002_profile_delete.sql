-- Sino G · migration 0002 — self-service account deletion
-- Allows a user to delete their OWN profile row. Memberships, availability,
-- hangout responses, and invites they sent cascade; groups they created are
-- preserved with created_by set to NULL.
-- NOTE: this removes app data. The auth.users row itself can only be removed
-- via the Supabase dashboard / Admin API (see README) — by design, RLS
-- policies never touch auth.users.

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using (id = auth.uid());
