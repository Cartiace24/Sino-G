-- Sino G · migration 0003 — RLS helper hardening (fixes groups 403)
--
-- ROOT CAUSE
-- The membership helpers (is_group_member, is_group_owner_or_admin,
-- is_group_owner, share_a_group_with) were LANGUAGE sql. PostgreSQL's planner
-- can INLINE a single-statement SQL function into the calling query, and an
-- inlined body executes with the CALLER's privileges and RLS context — not the
-- definer's. So when e.g. groups_select_member evaluated
-- USING (is_group_member(id)), the inlined lookup on public.group_members was
-- subjected to RLS again, re-entered the policy, and the membership check
-- failed instead of succeeding (infinite RLS recursion / permission failure).
-- Authenticated users therefore could not reliably read the groups table —
-- including owners reading back a group they had just created.
--
-- FIX (no RLS disabled, no policy logic changed, no app changes needed)
-- 1. Rewrite all four helpers in LANGUAGE plpgsql. plpgsql functions are never
--    inlined by the planner, so SECURITY DEFINER is always honored: the
--    membership lookup runs once, as the definer, bypassing RLS exactly where
--    intended — recursion is structurally impossible.
-- 2. SET search_path = '' (empty = safest). Every reference is schema
--    qualified (public.group_members, auth.uid()), so nothing can be hijacked
--    via search_path manipulation.
-- 3. Signatures, return types, and STABLE volatility are unchanged, so all
--    existing policies keep working untouched.
-- 4. Idempotent GRANTs so the migration is self-sufficient on fresh projects
--    (RLS stays enabled; grants never bypass RLS).

-- ================================================================
-- 1. Harden the four membership helpers
-- ================================================================
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  return exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
  );
end;
$$;

create or replace function public.is_group_owner_or_admin(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  return exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner', 'admin')
  );
end;
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  return exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  );
end;
$$;

create or replace function public.share_a_group_with(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  return exists (
    select 1
    from public.group_members mine
    join public.group_members theirs
      on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  );
end;
$$;

-- ================================================================
-- 2. Self-sufficient privileges (idempotent; RLS remains enforced)
-- ================================================================
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.group_invites to authenticated;
grant select, insert, update, delete on public.availability to authenticated;
grant select, insert, update, delete on public.hangout_requests to authenticated;
grant select, insert, update, delete on public.hangout_responses to authenticated;

grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- ================================================================
-- 3. Post-apply verification (run as an AUTHENTICATED user, e.g. via the
--    Supabase SQL editor "Run as user" or from the app)
-- ================================================================
-- TEST 1 — /groups load (was HTTP 403):
--   select * from public.groups;
--   -> returns only groups the caller belongs to, no error.
--
-- TEST 2 — create a group:
--   insert into public.groups (name, created_by)
--   values ('Verify Crew', auth.uid()) returning id, invite_code;
--   -> one row returned.
--
-- TEST 3 — owner membership auto-created by the on_group_created trigger:
--   select role from public.group_members
--   where group_id = '<id from TEST 2>' and user_id = auth.uid();
--   -> exactly one row, role = 'owner'.
--
-- TEST 4 — new group immediately visible (select policy + helper agree):
--   select id from public.groups where id = '<id from TEST 2>';
--   -> one row returned.
--   (Clean up: delete from public.groups where id = '<id from TEST 2>';)
