-- Sino G · migration 0014 — hard-delete long-closed hangouts
--
-- WHY
--   Hangouts now self-expire out of live lists (expires_at = proposed_time + 6h,
--   see hangouts.service). But closed/cancelled rows live forever. 0013 cleans
--   notifications + messages; this finishes the lifecycle for hangout_requests
--   themselves. Notification history survives via ON DELETE SET NULL on
--   notifications.hangout_id (see 0009 snapshot design).
--
-- WHAT
--   Extends public.cleanup_retention() with a fourth bucket: hangout_requests
--   with status closed/cancelled created over 180 days ago. Active rows are
--   never touched regardless of age.

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
  v_hangouts int := 0;
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

  with gone as (
    delete from public.hangout_requests
    where status in ('closed', 'cancelled')
      and created_at < now() - interval '180 days'
    returning id
  )
  select count(*)::int into v_hangouts from gone;

  return jsonb_build_object(
    'notifications_read', v_read,
    'notifications_unread', v_unread,
    'messages', v_msgs,
    'hangouts', v_hangouts
  );
end;
$$;

-- Verification:
--   select public.cleanup_retention();
--   -- {notifications_read: N, notifications_unread: M, messages: K, hangouts: J}
--   (The weekly pg_cron job from 0013 calls this same function — no new job.)
