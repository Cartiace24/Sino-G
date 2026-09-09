-- Sino G · migration 0009 — in-app notifications
--
-- ARCHITECTURE
--   DB event → trigger (SECURITY DEFINER) → notifications table
--     → supabase_realtime → React Query → bell / list.
-- Creation is trigger-driven so events are reliable and never depend on any
-- client being open. The client has NO insert path (see RLS below).
--
-- SNAPSHOT DESIGN
-- Titles/bodies embed the names needed to render (group name, hangout title,
-- actor name), because e.g. a removed member loses RLS access to the group —
-- the notification must render from its own row. group_id/hangout_id are kept
-- for navigation but are SET NULL-safe (ON DELETE SET NULL), so history
-- survives group/hangout deletion and member removal.
--
-- SELF-NOTIFICATION + DEDUP (all enforced in the triggers, not the client)
-- - Recipient sets always exclude the actor (joiner, creator, responder).
-- - hangout_responses UPDATE notifies only when OLD.response IS DISTINCT
--   FROM NEW.response (upsert rewrites with the same value notify nothing).
-- - hangout status notifies only on a real status transition into
--   cancelled/closed.
-- - No triggers exist ON notifications itself, so no recursion is possible.

-- ================================================================
-- 1. Table
-- ================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  group_id uuid references public.groups (id) on delete set null,
  hangout_id uuid references public.hangout_requests (id) on delete set null,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type check (type in (
    'member_joined', 'member_removed',
    'promoted_to_admin', 'demoted_to_member',
    'hangout_created', 'hangout_response',
    'hangout_cancelled', 'hangout_closed'
  ))
);

-- ================================================================
-- 2. Indexes (recipient feed + unread badge + FK lookups)
-- ================================================================
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications (user_id) where read_at is null;
create index if not exists idx_notifications_group
  on public.notifications (group_id);
create index if not exists idx_notifications_hangout
  on public.notifications (hangout_id);

-- ================================================================
-- 3. RLS — private by design, no client insert path
-- ================================================================
alter table public.notifications enable row level security;

drop policy if exists "notifs_select_own" on public.notifications;
create policy "notifs_select_own" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- Read-state only in practice: rows are addressed to the caller and cannot
-- be reassigned (WITH CHECK pins user_id).
drop policy if exists "notifs_update_own" on public.notifications;
create policy "notifs_update_own" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notifs_delete_own" on public.notifications;
create policy "notifs_delete_own" on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- NOTE: intentionally NO insert policy. Authenticated clients cannot create
-- notifications at all (not even their own); rows are written only by the
-- SECURITY DEFINER triggers below. Table-level INSERT is additionally
-- withheld in §7 grants as defense in depth.

-- ================================================================
-- 4. Event triggers (all plpgsql: never inlined, definer rights hold)
-- ================================================================

-- 4a. Someone joins -> notify the group's owners/admins (not the joiner).
-- Group creation also inserts an owner row, but the recipient set is then
-- empty (sole member excluded), so no noise is produced.
create or replace function public.notify_member_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group text;
  v_actor text;
begin
  select g.name into v_group from public.groups g where g.id = new.group_id;
  select p.display_name into v_actor from public.profiles p where p.id = new.user_id;

  insert into public.notifications (user_id, actor_id, group_id, type, title, body)
  select gm.user_id, new.user_id, new.group_id, 'member_joined',
    coalesce(v_actor, 'Someone') || ' joined ' || coalesce(v_group, 'your group'),
    'Say hi — and set your availability.'
  from public.group_members gm
  where gm.group_id = new.group_id
    and gm.role in ('owner', 'admin')
    and gm.user_id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_member_joined on public.group_members;
create trigger trg_notify_member_joined
  after insert on public.group_members
  for each row execute function public.notify_member_joined();

-- 4b. Role change member<->admin -> notify the member (never self).
create or replace function public.notify_member_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group text;
  v_type text;
  v_title text;
begin
  if old.role is not distinct from new.role then
    return new;
  end if;

  if new.role = 'admin' and old.role = 'member' then
    v_type := 'promoted_to_admin';
  elsif new.role = 'member' and old.role = 'admin' then
    v_type := 'demoted_to_member';
  else
    return new; -- owner grants etc. stay quiet in this MVP
  end if;

  if new.user_id = auth.uid() then
    return new; -- never self-notify
  end if;

  select g.name into v_group from public.groups g where g.id = new.group_id;
  if v_type = 'promoted_to_admin' then
    v_title := 'You are now an admin of ' || coalesce(v_group, 'your group');
  else
    v_title := 'You are no longer an admin of ' || coalesce(v_group, 'your group');
  end if;

  insert into public.notifications (user_id, actor_id, group_id, type, title, body)
  values (new.user_id, auth.uid(), new.group_id, v_type, v_title, 'Tap to open the group.');

  return new;
end;
$$;

drop trigger if exists trg_notify_member_role_change on public.group_members;
create trigger trg_notify_member_role_change
  after update of role on public.group_members
  for each row execute function public.notify_member_role_change();

-- 4c. Membership deleted -> notify the removed member (snapshot title: they
-- lose group access, so the row must render standalone). Self-leaves stay
-- silent. NOTE: group deletion cascades here too, so members get a
-- "removed" notice with the snapshot name — truthful and graceful.
create or replace function public.notify_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group text;
begin
  if old.user_id = auth.uid() then
    return old; -- leaving voluntarily: no notification
  end if;

  select g.name into v_group from public.groups g where g.id = old.group_id;

  insert into public.notifications (user_id, actor_id, group_id, type, title, body)
  values (old.user_id, auth.uid(), old.group_id, 'member_removed',
    'You were removed from ' || coalesce(v_group, 'a group'),
    'You no longer have access to it.');

  return old;
end;
$$;

drop trigger if exists trg_notify_member_removed on public.group_members;
create trigger trg_notify_member_removed
  after delete on public.group_members
  for each row execute function public.notify_member_removed();

-- 4d. Hangout created -> notify fellow members (not the creator).
create or replace function public.notify_hangout_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_title text;
begin
  select p.display_name into v_actor from public.profiles p where p.id = new.created_by;
  v_title := coalesce(new.title, 'a hangout');

  insert into public.notifications (user_id, actor_id, group_id, hangout_id, type, title, body)
  select gm.user_id, new.created_by, new.group_id, new.id, 'hangout_created',
    coalesce(v_actor, 'Someone') || ' started ' || v_title,
    case when new.location is not null then new.location else 'Tap to respond.' end
  from public.group_members gm
  where gm.group_id = new.group_id
    and gm.user_id <> new.created_by;

  return new;
end;
$$;

drop trigger if exists trg_notify_hangout_created on public.hangout_requests;
create trigger trg_notify_hangout_created
  after insert on public.hangout_requests
  for each row execute function public.notify_hangout_created();

-- 4e. Response added/meaningfully changed -> notify the hangout creator.
create or replace function public.notify_hangout_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator uuid;
  v_group uuid;
  v_title text;
  v_actor text;
  v_verb text;
begin
  if tg_op = 'UPDATE' and old.response is not distinct from new.response then
    return new; -- responded_at-only rewrite: stay silent
  end if;

  select hr.created_by, hr.group_id, hr.title
    into v_creator, v_group, v_title
  from public.hangout_requests hr
  where hr.id = new.hangout_request_id;

  if v_creator is null or new.user_id = v_creator then
    return new; -- creator responding to self: silent
  end if;

  select p.display_name into v_actor from public.profiles p where p.id = new.user_id;
  v_verb := case new.response
    when 'down' then 'is down for'
    when 'maybe' then 'might join'
    else 'can''t make'
  end;

  insert into public.notifications (user_id, actor_id, group_id, hangout_id, type, title, body)
  values (v_creator, new.user_id, v_group, new.hangout_request_id, 'hangout_response',
    coalesce(v_actor, 'Someone') || ' ' || v_verb || ' ' || coalesce(v_title, 'your hangout'),
    'Tap to see who''s in.');

  return new;
end;
$$;

drop trigger if exists trg_notify_hangout_response on public.hangout_responses;
create trigger trg_notify_hangout_response
  after insert or update of response on public.hangout_responses
  for each row execute function public.notify_hangout_response();

-- 4f. Hangout cancelled/closed -> notify members (not the actor).
create or replace function public.notify_hangout_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_title text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'cancelled' then
    v_type := 'hangout_cancelled';
  elsif new.status = 'closed' then
    v_type := 'hangout_closed';
  else
    return new;
  end if;

  v_title := coalesce(new.title, 'A hangout') ||
    case when new.status = 'cancelled' then ' was cancelled' else ' has been closed' end;

  insert into public.notifications (user_id, actor_id, group_id, hangout_id, type, title, body)
  select gm.user_id, auth.uid(), new.group_id, new.id, v_type, v_title, 'Tap for details.'
  from public.group_members gm
  where gm.group_id = new.group_id
    and gm.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000');

  return new;
end;
$$;

drop trigger if exists trg_notify_hangout_status on public.hangout_requests;
create trigger trg_notify_hangout_status
  after update of status on public.hangout_requests
  for each row execute function public.notify_hangout_status();

-- ================================================================
-- 5. Self-service retention cleanup (invoker rights + RLS; no cron)
-- Removes the CALLER's own read notifications older than p_days.
-- Recommendation: expose a "clear old" affordance later, or run manually.
-- ================================================================
create or replace function public.cleanup_old_notifications(p_days int default 90)
returns int
language sql
set search_path = ''
as $$
  with gone as (
    delete from public.notifications
    where user_id = auth.uid()
      and read_at is not null
      and read_at < now() - make_interval(days => greatest(p_days, 1))
    returning id
  )
  select count(*)::int from gone;
$$;

-- ================================================================
-- 6. Realtime publication (idempotent)
-- REPLICA IDENTITY FULL is REQUIRED here (not optional): the app filters
-- its subscription on user_id, a non-PK column. Without FULL, UPDATE/DELETE
-- events carry only the PK in the old tuple, so cross-device read-sync
-- (UPDATE read_at) would never be delivered to the filtered subscriber.
-- ================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

alter table public.notifications replica identity full;

-- ================================================================
-- 7. Grants — SELECT/UPDATE/DELETE only. INSERT is deliberately withheld
-- so even a compromised client cannot mint notifications; only the
-- SECURITY DEFINER triggers above can write rows.
-- ================================================================
grant select, update, delete on public.notifications to authenticated;

-- Verification:
--   RLS blocks cross-reads:
--     (as A) select count(*) from public.notifications; -- own rows only
--   Client insert is denied two ways (no policy + no grant):
--     insert into public.notifications (user_id, type, title)
--     values (auth.uid(), 'hangout_created', 'fake'); -- 42501
--   Trigger path (join a group as a second user) creates exactly the
--   managers' member_joined rows, never a self-row.
