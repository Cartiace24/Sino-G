-- Sino G · migration 0007 — owner rows immutable by non-owners
--
-- GAP (found in the Member Management audit)
-- members_update_manager and members_delete_self_or_manager let ANY
-- owner/admin touch ANY membership row — including the OWNER's. So an admin
-- could demote or remove the group owner through the API, bypassing the
-- intended Owner > Admin > Member hierarchy. The UI hides those actions, but
-- RLS must remain the source of truth.
--
-- FIX (tightening only; nothing is loosened, RLS stays enabled)
-- 1. UPDATE ... USING: managers may touch a row only if it is NOT an owner's
--    row, unless the caller is themselves an owner. (USING sees the OLD row.)
-- 2. UPDATE ... WITH CHECK: only owners may grant the owner role.
--    (WITH CHECK sees the NEW row.) Managers can still move members between
--    member <-> admin, which is exactly the supported promote/demote path.
-- 3. DELETE: unchanged self-leave escape hatch for everyone; deleting
--    SOMEONE ELSE's row now additionally requires the target to be a
--    non-owner unless the caller is an owner.
--
-- Resulting backend matrix (UI mirrors this, never exceeds it):
--   promote member->admin : owner yes / admin yes(*) / member no
--   demote admin->member  : owner yes / admin yes(*) / member no
--   remove member/admin   : owner yes / admin yes / member no
--   touch owner rows      : owner only
--   leave (self-delete)   : everyone (UI withholds it from owners to avoid
--                           ownerless groups; API keeps the escape hatch)
-- (*) The app UI conservatively offers promote/demote to owners only; the
--     backend permits managers as before.

drop policy if exists "members_update_manager" on public.group_members;
create policy "members_update_manager" on public.group_members
  for update to authenticated
  using (
    public.is_group_owner_or_admin(group_members.group_id)
    and (
      group_members.role <> 'owner'
      or public.is_group_owner(group_members.group_id)
    )
  )
  with check (
    public.is_group_owner_or_admin(group_members.group_id)
    and (
      group_members.role <> 'owner'
      or public.is_group_owner(group_members.group_id)
    )
  );

drop policy if exists "members_delete_self_or_manager" on public.group_members;
create policy "members_delete_self_or_manager" on public.group_members
  for delete to authenticated
  using (
    group_members.user_id = auth.uid()
    or (
      public.is_group_owner_or_admin(group_members.group_id)
      and (
        group_members.role <> 'owner'
        or public.is_group_owner(group_members.group_id)
      )
    )
  );

-- Verification (two accounts, A = owner, B = admin, C = member):
-- 1. As B: update C's role / delete C's row -> allowed (unchanged).
-- 2. As B: update or delete A's (owner) row -> denied (42501). This is new.
-- 3. As A: promote/demote/remove anyone -> allowed (unchanged).
-- 4. As C: update/delete anyone else's row -> denied (unchanged).
-- 5. Anyone deleting their OWN row (leave) -> allowed (unchanged).
