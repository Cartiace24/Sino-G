-- Sino G · migration 0013 — retention cleanup (server-side, scheduled)
--
-- WHY
--   notifications + group_messages grow forever (every join/response/message
--   mints rows via the 0009/0010/0011/0012 triggers). 0009 shipped a
--   caller-scoped cleanup_old_notifications(p_days) but nothing ever CALLS it
--   on a schedule, unread rows are never eligible, and chat history is
--   unbounded. The client now deletes replaced avatars itself
--   (storage.service delete*ByUrl), so this covers what only the DB can do.
--
-- WHAT
--   public.cleanup_retention() — SECURITY DEFINER, one call cleans:
--     1. read notifications older than 90 days (all users)
--     2. unread notifications older than 180 days (safety net; recent unread kept)
--     3. group_messages older than 180 days
--   Returns { notifications_read, notifications_unread, messages } as jsonb.
--   A weekly pg_cron job is scheduled when the extension exists; otherwise
--   run manually:  select public.cleanup_retention();
--
-- STORAGE (not SQL-cleanable)
--   Orphan avatars can't be removed from SQL — set a bucket lifecycle in the
--   Dashboard (Storage → profile-avatars/group-avatars → lifecycle) or run a
--   periodic service-role script listing unreferenced paths. Replaced avatars
--   are already deleted client-side on successful row update.

create or replace function public.cleanup_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_read int := 0;
  v_unread int := 0;
  v_msgs int := 0;
begin
  with gone as (
    delete from public.notifications
    where read_at is not null
      and read_at < now() - interval '90 days'
    returning id
  )
  select count(*)::int into v_read from gone;

  with gone as (
    delete from public.notifications
    where read_at is null
      and created_at < now() - interval '180 days'
    returning id
  )
  select count(*)::int into v_unread from gone;

  with gone as (
    delete from public.group_messages
    where created_at < now() - interval '180 days'
    returning id
  )
  select count(*)::int into v_msgs from gone;

  return jsonb_build_object(
    'notifications_read', v_read,
    'notifications_unread', v_unread,
    'messages', v_msgs
  );
end;
$$;

-- Weekly Sunday 03:00 UTC, only when pg_cron is installed (Supabase has it;
-- local `supabase db` instances may not — the function above still works).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'sinog-retention-weekly',
      '0 3 * * 0',
      'select public.cleanup_retention();'
    );
  end if;
exception
  when duplicate_object then null; -- job already scheduled: idempotent rerun
  when undefined_function then null; -- cron.schedule missing: manual mode
end;
$$;

-- Verification:
--   select public.cleanup_retention();
--   -- {notifications_read: N, notifications_unread: M, messages: K}
--   select jobname, schedule from cron.job where jobname = 'sinog-retention-weekly';
