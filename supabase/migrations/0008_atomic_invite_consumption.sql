-- Sino G · migration 0008 — atomic invite consumption
--
-- GAP (flagged in the functional audit)
-- join_group_with_code resolved a secondary invite with a plain SELECT,
-- validated max_uses, then incremented uses in a separate UPDATE. Two
-- concurrent joins on a max_uses=1 code could both read uses=0, both pass
-- the check, and both increment — overshooting the cap. Frontend checks
-- cannot fix this; the database must serialize consumption.
--
-- FIX (same signature, same error codes, no RLS/policy changes)
-- Re-resolve the secondary invite row with SELECT ... FOR UPDATE. The row
-- lock serializes concurrent joiners inside their transactions: the loser
-- waits, then re-reads the winner's committed uses and correctly raises
-- INVITE_MAXED. Lookup → membership check → expiry → cap → increment →
-- insert now happen atomically per invite row. Primary group codes carry no
-- counter and are unaffected.
-- Also reordered: ALREADY_MEMBER is now checked BEFORE burning a use, so a
-- member re-entering a code no longer consumes someone else's slot.

create or replace function public.join_group_with_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_invite_id uuid;
  v_expires timestamptz;
  v_max int;
  v_uses int;
  v_code text := upper(trim(p_code));
begin
  if v_code is null or v_code = '' then
    raise exception 'INVITE_REQUIRED' using errcode = 'P0001';
  end if;

  -- 1) Primary group invite codes (no counter — nothing to serialize)
  select id into v_group_id
  from public.groups
  where upper(invite_code) = v_code;

  -- 2) Secondary per-invite codes, row-locked for atomic consumption
  if v_group_id is null then
    select id, group_id, expires_at, max_uses, uses
      into v_invite_id, v_group_id, v_expires, v_max, v_uses
    from public.group_invites
    where upper(invite_code) = v_code
    for update;

    if v_group_id is null then
      raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  -- 3) Already a member? (before burning a use)
  if exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = auth.uid()
  ) then
    raise exception 'ALREADY_MEMBER' using errcode = 'P0001';
  end if;

  -- 4) Secondary-invite gates, evaluated under the row lock
  if v_invite_id is not null then
    if v_expires is not null and v_expires < now() then
      raise exception 'INVITE_EXPIRED' using errcode = 'P0001';
    end if;
    if v_max is not null and v_uses >= v_max then
      raise exception 'INVITE_MAXED' using errcode = 'P0001';
    end if;

    update public.group_invites
    set uses = uses + 1
    where id = v_invite_id;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, auth.uid(), 'member');

  return v_group_id;
end;
$$;

-- Verification (needs a secondary invite; managers mint via group_invites):
--   1. Join with a fresh code -> membership row, uses +1.
--   2. Re-join same code as a member -> ALREADY_MEMBER, uses unchanged.
--   3. max_uses=1 code joined concurrently x2 -> exactly one succeeds,
--      the other raises INVITE_MAXED; uses stays 1.
--   4. Expired code -> INVITE_EXPIRED; deleted (revoked) code ->
--      INVITE_NOT_FOUND.
