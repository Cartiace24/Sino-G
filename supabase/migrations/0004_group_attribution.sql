-- Sino G · migration 0004 — authoritative group attribution
--
-- CONTEXT
-- INSERTs into public.groups were rejected with
--   42501 "new row violates row-level security policy for table groups",
-- i.e. the groups_insert WITH CHECK (created_by = auth.uid()) failed.
-- Possible inputs: client-sent created_by missing/mismatched, or no JWT on
-- the request (auth.uid() NULL). Rather than guessing client-side, attribute
-- authoritatively in the database:
--
-- 1. BEFORE INSERT trigger forces NEW.created_by := auth.uid(), so a
--    mistyped/missing client value can never trip the WITH CHECK again.
--    (Strictly MORE secure: callers can no longer spoof authorship.)
-- 2. If auth.uid() IS NULL (unauthenticated request), raise a named,
--    human-readable exception instead of the cryptic 42501. The app maps
--    NOT_AUTHENTICATED to "session expired, log in again".
--
-- The groups_insert policy is intentionally left in place as defense in depth.

create or replace function public.handle_groups_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  if new.created_by is null then
    raise exception 'NOT_AUTHENTICATED: no user session on this request. Sign in and retry.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists on_groups_attribution on public.groups;
create trigger on_groups_attribution
  before insert on public.groups
  for each row execute function public.handle_groups_attribution();

-- Verification (authenticated request, e.g. from the app):
--   insert into public.groups (name) values ('Verify Crew')
--   returning id, invite_code, created_by;
-- -> one row; created_by equals auth.uid(); owner membership row follows via
--    the on_group_created trigger.
