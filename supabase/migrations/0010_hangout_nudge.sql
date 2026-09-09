-- Sino G · migration 0010 — hangout nudge (notify fellow members)
--
-- GAP
-- "Nudge the GC" only copied text to the clipboard; no in-app notification
-- ever reached the other members.
--
-- DESIGN (consistent with the trigger architecture in 0009)
-- A nudge is a client-initiated action, not a data change, so no trigger can
-- observe it. Instead this SECURITY DEFINER RPC is the single writer:
--   * caller must be a group member (else NOT_IN_GROUP);
--   * hangout must exist and be active (else HANGOUT_NOT_FOUND/NOT_ACTIVE);
--   * one nudge per hangout per 5 minutes, any actor (NUDGE_COOLDOWN) — this
--     is the anti-spam mechanism; a per-actor cooldown would still allow N
--     members to ping the group N times in a row;
--   * recipients = fellow members EXCEPT the nudger and anyone already down
--     (nudging people who already said yes is pure noise);
--   * inserts snapshot titles like every other notification type, so rows
--     render standalone and survive hangout/group deletion (SET NULL FKs);
--   * returns the recipient count so the UI can confirm ("3 friends nudged").
-- No RLS/policy changes: the function authorizes internally, and delivery to
-- recipients flows through the existing publication + select-own policy.

-- 1) Extend the type check (drop + re-add; CHECK names are stable here).
alter table public.notifications drop constraint if exists notifications_type;
alter table public.notifications
  add constraint notifications_type check (type in (
    'member_joined', 'member_removed',
    'promoted_to_admin', 'demoted_to_member',
    'hangout_created', 'hangout_response',
    'hangout_cancelled', 'hangout_closed',
    'hangout_nudge'
  ));

-- 2) The RPC.
create or replace function public.nudge_hangout(p_hangout_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
  v_title text;
  v_status text;
  v_actor text;
  v_count int;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED: no user session on this request. Sign in and retry.'
      using errcode = 'P0001';
  end if;

  select hr.group_id, hr.title, hr.status
    into v_group, v_title, v_status
  from public.hangout_requests hr
  where hr.id = p_hangout_id;

  if not found then
    raise exception 'HANGOUT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_status <> 'active' then
    raise exception 'HANGOUT_NOT_ACTIVE: this hangout is already closed or cancelled.'
      using errcode = 'P0001';
  end if;
  if not public.is_group_member(v_group) then
    raise exception 'NOT_IN_GROUP: you are no longer a member of this group.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.notifications
    where hangout_id = p_hangout_id
      and type = 'hangout_nudge'
      and created_at > now() - make_interval(mins => 5)
  ) then
    raise exception 'NUDGE_COOLDOWN: someone just nudged this hangout — give it a few minutes.'
      using errcode = 'P0001';
  end if;

  select p.display_name into v_actor from public.profiles p where p.id = v_user;

  insert into public.notifications (user_id, actor_id, group_id, hangout_id, type, title, body)
  select gm.user_id, v_user, v_group, p_hangout_id, 'hangout_nudge',
    coalesce(v_actor, 'Someone') || ' nudged ' || coalesce(v_title, 'a hangout'),
    'They want an answer — are you down?'
  from public.group_members gm
  where gm.group_id = v_group
    and gm.user_id <> v_user
    and not exists (
      select 1 from public.hangout_responses r
      where r.hangout_request_id = p_hangout_id
        and r.user_id = gm.user_id
        and r.response = 'down'
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Verification:
--   select public.nudge_hangout('<hangout-id>');  -- returns recipient count
--   select type, title from public.notifications
--   where hangout_id = '<hangout-id>' order by created_at desc;
--   Immediate re-nudge -> NUDGE_COOLDOWN. Nudge of a closed hangout ->
--   HANGOUT_NOT_ACTIVE. Recipients exclude the nudger and down-responders.
