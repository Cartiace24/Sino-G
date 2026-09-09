-- Sino G · migration 0005 — create_group RPC (robust creation path)
--
-- CONTEXT
-- Client-side INSERTs into public.groups were rejected with
--   42501 "new row violates row-level security policy for table groups"
-- even with the groups_insert policy present and correct, i.e. the
-- client-supplied created_by failed to match auth.uid() at check time.
-- Rather than depending on that client-controlled handoff, group creation now
-- goes through this SECURITY DEFINER function (same pattern as the existing
-- join_group_with_code RPC):
--   * the ONLY inputs are name/description;
--   * the author comes from auth.uid() server-side — mismatch impossible;
--   * unauthenticated callers get a named NOT_AUTHENTICATED error, not 42501;
--   * the on_group_created trigger still fires in the same transaction, so
--     the creator's owner membership row is created atomically;
--   * RLS stays enabled; the function authorizes internally (auth.uid() check).
--
-- The app tries this RPC first and falls back to a direct INSERT for
-- projects where 0005 has not been applied yet.

create or replace function public.create_group(p_name text, p_description text default null)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_group public.groups;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED: no user session on this request. Sign in and retry.'
      using errcode = 'P0001';
  end if;
  if v_name = '' then
    raise exception 'GROUP_NAME_REQUIRED: give your group a name first.'
      using errcode = 'P0001';
  end if;
  if char_length(v_name) > 60 then
    raise exception 'GROUP_NAME_TOO_LONG: keep the group name under 60 characters.'
      using errcode = 'P0001';
  end if;

  insert into public.groups (name, description, created_by)
  values (v_name, v_desc, v_user)
  returning * into v_group;

  return v_group;
end;
$$;

-- Verification (authenticated request, e.g. from the app):
--   select * from public.create_group('Verify Crew', 'checking the path');
-- -> one group row with created_by = auth.uid(), plus an owner membership row
--    from the on_group_created trigger in the same transaction.
