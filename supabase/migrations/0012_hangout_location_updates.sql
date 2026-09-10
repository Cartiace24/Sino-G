-- Sino G · migration 0012 — pinned hangout locations + update notifications
--
-- SCOPE
-- 1. Optional exact pin coordinates on hangout_requests (nullable: legacy
--    text-only hangouts keep working untouched).
-- 2. Richer hangout_created notifications (datetime + location context).
-- 3. New hangout_updated notifications when date/time or location REALLY
--    change — exactly one row per save, never to the editor.
--
-- TIMEZONE NOTE (documented assumption)
-- Trigger text formats proposed_time in Asia/Manila wall-clock, matching the
-- app's existing conventions (availability DATE+TIME has no zone; the client
-- writes local "Tonight · 7 PM" labels). A UTC rendering would disagree with
-- what users see by hours; PH-first matches this product's audience.
--
-- No RLS/policy changes: updates are already restricted to creator/owner/
-- admin by hangouts_update_creator_or_admin, and both tables were already in
-- the realtime publication. No new grants needed (column additions inherit).

-- ================================================================
-- 1. Optional pin coordinates (nullable = backwards compatible)
-- ================================================================
alter table public.hangout_requests
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;

-- ================================================================
-- 2. Notification type for updates
-- ================================================================
alter table public.notifications drop constraint if exists notifications_type;
alter table public.notifications
  add constraint notifications_type check (type in (
    'member_joined', 'member_removed',
    'promoted_to_admin', 'demoted_to_member',
    'hangout_created', 'hangout_response',
    'hangout_cancelled', 'hangout_closed',
    'hangout_nudge', 'new_message',
    'hangout_updated'
  ));

-- ================================================================
-- 3. Shared wall-clock formatter (PH, see note above)
-- ================================================================
create or replace function public.format_hangout_when(p_time timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_time is null then 'no set time'
    else to_char(p_time at time zone 'Asia/Manila', 'Dy, Mon DD · FMHH12:MI AM')
  end;
$$;

-- ================================================================
-- 4. Richer hangout_created (supersedes the 0009 version, same trigger)
-- Body now carries the scheduled time and place, not just the title.
-- ================================================================
create or replace function public.notify_hangout_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_title text;
  v_lines text[] := '{}';
begin
  select p.display_name into v_actor from public.profiles p where p.id = new.created_by;
  v_title := coalesce(new.title, 'a hangout');

  if new.proposed_time is not null then
    v_lines := v_lines || public.format_hangout_when(new.proposed_time);
  end if;
  if new.location is not null then
    v_lines := v_lines || new.location;
  end if;
  if array_length(v_lines, 1) is null then
    v_lines := v_lines || 'Tap to respond.';
  end if;

  insert into public.notifications (user_id, actor_id, group_id, hangout_id, type, title, body)
  select gm.user_id, new.created_by, new.group_id, new.id, 'hangout_created',
    coalesce(v_actor, 'Someone') || ' started ' || v_title,
    array_to_string(v_lines, chr(10))
  from public.group_members gm
  where gm.group_id = new.group_id
    and gm.user_id <> new.created_by;

  return new;
end;
$$;

-- trigger trg_notify_hangout_created already exists from 0009 and calls this
-- function by name: replacing the function is sufficient, no DDL needed.

-- ================================================================
-- 5. hangout_updated: exactly one notification per meaningful save
-- Fires on updates touching the watched columns, but notifies ONLY when
-- proposed_time or the location (name or pin) actually changed
-- (IS DISTINCT FROM is NULL-safe). Status-only saves (close/cancel keep
-- their own notifications), title-only saves, and identical re-saves stay
-- silent. Recipients: all current members except the editor.
-- ================================================================
create or replace function public.notify_hangout_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_time_changed boolean;
  v_loc_changed boolean;
  v_title text;
  v_lines text[] := '{}';
begin
  v_time_changed := old.proposed_time is distinct from new.proposed_time;
  v_loc_changed := old.location is distinct from new.location
    or old.location_lat is distinct from new.location_lat
    or old.location_lng is distinct from new.location_lng;

  if not (v_time_changed or v_loc_changed) then
    return new;
  end if;

  v_title := coalesce(new.title, 'a hangout');

  if v_time_changed then
    v_lines := v_lines ||
      public.format_hangout_when(old.proposed_time)
      || ' → ' || public.format_hangout_when(new.proposed_time);
  end if;
  if v_loc_changed then
    v_lines := v_lines ||
      coalesce(old.location, 'no pinned place')
      || ' → ' || coalesce(new.location, 'no pinned place');
  end if;

  insert into public.notifications (user_id, actor_id, group_id, hangout_id, type, title, body)
  select gm.user_id, auth.uid(), new.group_id, new.id, 'hangout_updated',
    'Hangout updated: ' || v_title,
    array_to_string(v_lines, chr(10))
  from public.group_members gm
  where gm.group_id = new.group_id
    and gm.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000');

  return new;
end;
$$;

drop trigger if exists trg_notify_hangout_updated on public.hangout_requests;
create trigger trg_notify_hangout_updated
  after update of proposed_time, location, location_lat, location_lng
  on public.hangout_requests
  for each row execute function public.notify_hangout_updated();

-- Verification:
--   1. Insert with location+coords -> created notification carries time+place.
--   2. Update only title -> zero new notifications.
--   3. Update time -> exactly one hangout_updated to fellow members, none to
--      the editor; body shows old → new.
--   4. Update location+time together -> still exactly one row, both lines.
--   5. Re-save identical values -> silent.
--   6. Close/cancel (status-only) -> no hangout_updated (own notifications).
--   7. Legacy text-only rows read/update exactly as before (cols nullable).
