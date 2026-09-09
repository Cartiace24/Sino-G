-- Sino G · migration 0006 — realtime for group membership + group rows
--
-- GAP
-- The app subscribed to hangout_requests / hangout_responses / availability,
-- but nothing ever subscribed to group_members or groups — and this
-- publication didn't even include those tables, so Postgres broadcast nothing
-- for them. Result: User A viewing a group never saw User B join/leave until
-- a manual refresh.
--
-- THIS MIGRATION
-- 1. Adds public.groups and public.group_members to the supabase_realtime
--    publication (guarded, idempotent — same pattern as 0001).
-- 2. Sets REPLICA IDENTITY FULL on public.group_members. The app scopes its
--    membership subscription with a `group_id=eq.<id>` filter; for
--    UPDATE/DELETE events Postgres matches the filter against the OLD tuple,
--    which by default carries only the PK (id) — so a member LEAVING (DELETE)
--    would never be delivered to the filtered subscriber. FULL makes the old
--    tuple carry group_id, so INSERT/UPDATE/DELETE all arrive. (The groups
--    subscription filters on the PK `id`, so the default identity suffices
--    there; WAL cost of FULL on a small membership table is negligible.)
-- 3. RLS still governs delivery: subscribers only receive rows they are
--    allowed to SELECT (fellow members), so no membership data leaks.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table public.groups;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
end
$$;

alter table public.group_members replica identity full;

-- Verification (SQL editor):
--   select tablename from pg_publication_tables
--   where pubname = 'supabase_realtime'
--     and tablename in ('groups', 'group_members');
-- -> two rows.
--   select c.relname, c.relreplident
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname = 'group_members';
-- -> relreplident = 'f' (FULL).
--
-- Live test (two accounts):
--   A opens a Group Detail page; B joins A's group via invite code.
--   A sees B in the member list with no refresh. A also sees updated counts
--   on Today / Groups / Me, and role changes / removals land the same way.
