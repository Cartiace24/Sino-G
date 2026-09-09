-- Sino G · migration 0011 — group chat v1 (one shared room per group)
--
-- SCOPE: plain-text group messages only. No threads, edits, reactions,
-- receipts, or attachments. Unread tracking is explicitly out of V1.
--
-- DESIGN NOTES
-- - No updated_at: editing does not exist, so there is nothing to maintain.
-- - group_id + sender profiles are embedded via FKs for single-query reads.
-- - RLS reuses is_group_member(); sender spoofing is impossible because the
--   insert policy pins sender_id = auth.uid().
-- - REPLICA IDENTITY FULL (like group_members in 0006): the app filters its
--   chat subscription on group_id, a non-PK column, so filtered DELETEs
--   would otherwise never be delivered to viewers.
-- - Chat notifications ride the existing 0009 trigger architecture
--   (new_message type added below): fellow members except the sender, with
--   snapshot title/body so rows render standalone.

-- ================================================================
-- 1. Table
-- ================================================================
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint group_messages_content_not_empty check (length(btrim(content)) > 0),
  constraint group_messages_content_max_len check (length(content) <= 1000)
);

-- ================================================================
-- 2. Index (newest-first feed per group)
-- ================================================================
create index if not exists idx_group_messages_group_created
  on public.group_messages (group_id, created_at desc, id desc);

-- ================================================================
-- 3. RLS
-- ================================================================
alter table public.group_messages enable row level security;

-- Read: current members only.
drop policy if exists "messages_select_member" on public.group_messages;
create policy "messages_select_member" on public.group_messages
  for select to authenticated
  using (public.is_group_member(group_id));

-- Write: current members only, and the sender must be the caller.
-- (server-side enforcement — the client cannot spoof sender_id.)
drop policy if exists "messages_insert_member" on public.group_messages;
create policy "messages_insert_member" on public.group_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_group_member(group_id)
  );

-- Delete: own messages only. No UPDATE policy (no editing in V1).
drop policy if exists "messages_delete_own" on public.group_messages;
create policy "messages_delete_own" on public.group_messages
  for delete to authenticated
  using (sender_id = auth.uid());

-- ================================================================
-- 4. Realtime (idempotent) + replica identity for filtered DELETEs
-- ================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'group_messages'
  ) then
    alter publication supabase_realtime add table public.group_messages;
  end if;
end
$$;

alter table public.group_messages replica identity full;

-- ================================================================
-- 5. Grants (select/insert/delete only — no update grant, no editing)
-- ================================================================
grant select, insert, delete on public.group_messages to authenticated;

-- ================================================================
-- 6. New-message notifications via the existing 0009 architecture
-- ================================================================
alter table public.notifications drop constraint if exists notifications_type;
alter table public.notifications
  add constraint notifications_type check (type in (
    'member_joined', 'member_removed',
    'promoted_to_admin', 'demoted_to_member',
    'hangout_created', 'hangout_response',
    'hangout_cancelled', 'hangout_closed',
    'hangout_nudge', 'new_message'
  ));

-- Fellow members except the sender. Snapshot title/body keep the row
-- standalone if the group or hangout context later disappears.
create or replace function public.notify_new_message()
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
  select p.display_name into v_actor from public.profiles p where p.id = new.sender_id;

  insert into public.notifications (user_id, actor_id, group_id, type, title, body)
  select gm.user_id, new.sender_id, new.group_id, 'new_message',
    'New message in ' || coalesce(v_group, 'your group'),
    coalesce(v_actor, 'Someone') || ': ' || left(new.content, 120)
  from public.group_members gm
  where gm.group_id = new.group_id
    and gm.user_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_message on public.group_messages;
create trigger trg_notify_new_message
  after insert on public.group_messages
  for each row execute function public.notify_new_message();

-- Verification:
--   As member A: insert into public.group_messages (group_id, sender_id, content)
--     values ('<gid>', auth.uid(), 'hello');  -- one row
--   Fellow members each gain exactly one new_message row; the sender gains none.
--   Empty/blank content and >1000 chars are rejected by CHECK constraints.
--   As an outsider: select/insert/delete on the group all denied.
--   Delete own message -> fellow viewers' filtered DELETE arrives (FULL).
