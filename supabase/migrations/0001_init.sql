-- Sino G · initial schema (MVP)
-- Run with: supabase db push  (or paste into the Supabase SQL editor)
-- Tables: profiles, groups, group_members, group_invites, availability,
--         hangout_requests, hangout_responses

-- ================================================================
-- 0. Helpers
-- ================================================================
create extension if not exists "pgcrypto";

-- Auto-maintain updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 6-char invite codes from an unambiguous alphabet (no 0/O, 1/I)
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
  end loop;
  return code;
end;
$$;

-- ================================================================
-- 1. Tables
-- ================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,24}$')
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  avatar_url text,
  created_by uuid references public.profiles (id) on delete set null,
  invite_code text unique not null default public.generate_invite_code(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_len check (char_length(name) between 1 and 60)
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  constraint group_members_role check (role in ('owner', 'admin', 'member')),
  constraint group_members_unique unique (group_id, user_id)
);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  invite_code text unique not null default public.generate_invite_code(),
  expires_at timestamptz,
  max_uses int,
  uses int not null default 0,
  created_at timestamptz not null default now(),
  constraint group_invites_uses_nonneg check (uses >= 0),
  constraint group_invites_max_pos check (max_uses is null or max_uses > 0)
);

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_status check (status in ('free', 'maybe', 'busy')),
  constraint availability_time_order check (end_time > start_time)
);

create table if not exists public.hangout_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text,
  message text,
  location text,
  proposed_time timestamptz,
  expires_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint hangout_status check (status in ('active', 'closed', 'cancelled'))
);

create table if not exists public.hangout_responses (
  id uuid primary key default gen_random_uuid(),
  hangout_request_id uuid not null references public.hangout_requests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  response text not null,
  responded_at timestamptz not null default now(),
  constraint hangout_response_value check (response in ('down', 'maybe', 'unavailable')),
  constraint hangout_response_unique unique (hangout_request_id, user_id)
);

-- ================================================================
-- 2. Indexes (hot query paths)
-- ================================================================
create index if not exists idx_group_members_group on public.group_members (group_id);
create index if not exists idx_group_members_user on public.group_members (user_id);
create index if not exists idx_groups_invite_code on public.groups (invite_code);
create index if not exists idx_group_invites_code on public.group_invites (invite_code);
create index if not exists idx_availability_user_date on public.availability (user_id, date);
create index if not exists idx_availability_date on public.availability (date);
create index if not exists idx_hangouts_group on public.hangout_requests (group_id, created_at desc);
create index if not exists idx_hangout_responses_req on public.hangout_responses (hangout_request_id);
create index if not exists idx_hangout_responses_user on public.hangout_responses (user_id);
create index if not exists idx_profiles_username on public.profiles (username);

-- ================================================================
-- 3. Membership helper functions (SECURITY DEFINER avoids RLS recursion)
-- ================================================================
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner_or_admin(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  );
$$;

create or replace function public.share_a_group_with(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs
      on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  );
$$;

-- ================================================================
-- 4. Triggers
-- ================================================================
-- 4a. Auto-create profile on signup. Username comes from signup metadata,
--     falls back to a unique user_<shortid>. Never fails registration.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_display text;
begin
  v_username := nullif(new.raw_user_meta_data ->> 'username', '');
  v_display := nullif(new.raw_user_meta_data ->> 'display_name', '');

  if v_display is null then
    v_display := coalesce(split_part(new.email, '@', 1), 'New friend');
  end if;

  if v_username is null then
    v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  -- Ensure uniqueness without ever failing the signup
  while exists (select 1 from public.profiles where username = v_username) loop
    v_username := v_username || substr(replace(gen_random_uuid()::text, '-', ''), 1, 2);
  end loop;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, v_display)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4b. Creator automatically becomes group owner
create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.group_members (group_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict (group_id, user_id) do update set role = 'owner';
  end if;
  return new;
end;
$$;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();

-- 4c. updated_at maintenance
drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_groups_touch on public.groups;
create trigger trg_groups_touch
  before update on public.groups
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_availability_touch on public.availability;
create trigger trg_availability_touch
  before update on public.availability
  for each row execute function public.touch_updated_at();

-- ================================================================
-- 5. Atomic join-by-code (validates + inserts + bumps uses, one call)
-- ================================================================
create or replace function public.join_group_with_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
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

  -- 1) Primary group invite codes
  select id into v_group_id
  from public.groups
  where upper(invite_code) = v_code;

  -- 2) Secondary per-invite codes (expiry + max-uses enforced)
  if v_group_id is null then
    select id, group_id, expires_at, max_uses, uses
      into v_invite_id, v_group_id, v_expires, v_max, v_uses
    from public.group_invites
    where upper(invite_code) = v_code;

    if v_group_id is null then
      raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001';
    end if;
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

  -- 3) Already a member?
  if exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = auth.uid()
  ) then
    raise exception 'ALREADY_MEMBER' using errcode = 'P0001';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, auth.uid(), 'member');

  return v_group_id;
end;
$$;

-- ================================================================
-- 6. Row Level Security
-- ================================================================
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.availability enable row level security;
alter table public.hangout_requests enable row level security;
alter table public.hangout_responses enable row level security;

-- ---------- profiles ----------
drop policy if exists "profiles_select_shared" on public.profiles;
create policy "profiles_select_shared" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.share_a_group_with(id)
  );

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------- groups ----------
drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member" on public.groups
  for select to authenticated
  using (public.is_group_member(id));

drop policy if exists "groups_insert" on public.groups;
create policy "groups_insert" on public.groups
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "groups_update_manager" on public.groups;
create policy "groups_update_manager" on public.groups
  for update to authenticated
  using (public.is_group_owner_or_admin(id))
  with check (public.is_group_owner_or_admin(id));

drop policy if exists "groups_delete_owner" on public.groups;
create policy "groups_delete_owner" on public.groups
  for delete to authenticated
  using (public.is_group_owner(id));

-- ---------- group_members ----------
drop policy if exists "members_select_fellow" on public.group_members;
create policy "members_select_fellow" on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "members_insert_manager" on public.group_members;
create policy "members_insert_manager" on public.group_members
  for insert to authenticated
  with check (public.is_group_owner_or_admin(group_id));

drop policy if exists "members_update_manager" on public.group_members;
create policy "members_update_manager" on public.group_members
  for update to authenticated
  using (public.is_group_owner_or_admin(group_id))
  with check (public.is_group_owner_or_admin(group_id));

-- Owners/admins can remove anyone; members can remove (leave) themselves.
drop policy if exists "members_delete_self_or_manager" on public.group_members;
create policy "members_delete_self_or_manager" on public.group_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_owner_or_admin(group_id)
  );

-- ---------- group_invites ----------
drop policy if exists "invites_select_member" on public.group_invites;
create policy "invites_select_member" on public.group_invites
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "invites_insert_manager" on public.group_invites;
create policy "invites_insert_manager" on public.group_invites
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and public.is_group_owner_or_admin(group_id)
  );

drop policy if exists "invites_update_manager" on public.group_invites;
create policy "invites_update_manager" on public.group_invites
  for update to authenticated
  using (public.is_group_owner_or_admin(group_id))
  with check (public.is_group_owner_or_admin(group_id));

drop policy if exists "invites_delete_manager" on public.group_invites;
create policy "invites_delete_manager" on public.group_invites
  for delete to authenticated
  using (public.is_group_owner_or_admin(group_id));

-- ---------- availability ----------
drop policy if exists "avail_select_shared" on public.availability;
create policy "avail_select_shared" on public.availability
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.share_a_group_with(user_id)
  );

drop policy if exists "avail_insert_own" on public.availability;
create policy "avail_insert_own" on public.availability
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "avail_update_own" on public.availability;
create policy "avail_update_own" on public.availability
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "avail_delete_own" on public.availability;
create policy "avail_delete_own" on public.availability
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------- hangout_requests ----------
drop policy if exists "hangouts_select_member" on public.hangout_requests;
create policy "hangouts_select_member" on public.hangout_requests
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "hangouts_insert_member" on public.hangout_requests;
create policy "hangouts_insert_member" on public.hangout_requests
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_group_member(group_id)
  );

drop policy if exists "hangouts_update_creator_or_manager" on public.hangout_requests;
create policy "hangouts_update_creator_or_manager" on public.hangout_requests
  for update to authenticated
  using (
    created_by = auth.uid()
    or public.is_group_owner_or_admin(group_id)
  )
  with check (
    created_by = auth.uid()
    or public.is_group_owner_or_admin(group_id)
  );

drop policy if exists "hangouts_delete_creator_or_owner" on public.hangout_requests;
create policy "hangouts_delete_creator_or_owner" on public.hangout_requests
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.is_group_owner(group_id)
  );

-- ---------- hangout_responses ----------
drop policy if exists "responses_select_member" on public.hangout_responses;
create policy "responses_select_member" on public.hangout_responses
  for select to authenticated
  using (
    exists (
      select 1
      from public.hangout_requests hr
      where hr.id = hangout_request_id
        and public.is_group_member(hr.group_id)
    )
  );

drop policy if exists "responses_insert_own" on public.hangout_responses;
create policy "responses_insert_own" on public.hangout_responses
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.hangout_requests hr
      where hr.id = hangout_request_id
        and public.is_group_member(hr.group_id)
    )
  );

drop policy if exists "responses_update_own" on public.hangout_responses;
create policy "responses_update_own" on public.hangout_responses
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "responses_delete_own" on public.hangout_responses;
create policy "responses_delete_own" on public.hangout_responses
  for delete to authenticated
  using (user_id = auth.uid());

-- ================================================================
-- 7. Storage buckets (avatars)
-- ================================================================
insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('group-avatars', 'group-avatars', true)
on conflict (id) do nothing;

-- Public read (avatars are shown to fellow group members)
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('profile-avatars', 'group-avatars'));

-- Users manage their own profile avatar under profiles/{uid}/...
drop policy if exists "profile_avatar_own_write" on storage.objects;
create policy "profile_avatar_own_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and split_part(name, '/', 1) = 'profiles'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "profile_avatar_own_update" on storage.objects;
create policy "profile_avatar_own_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-avatars'
    and split_part(name, '/', 1) = 'profiles'
    and split_part(name, '/', 2) = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and split_part(name, '/', 1) = 'profiles'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "profile_avatar_own_delete" on storage.objects;
create policy "profile_avatar_own_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-avatars'
    and split_part(name, '/', 1) = 'profiles'
    and split_part(name, '/', 2) = auth.uid()::text
  );

-- Group owners/admins manage group avatars under groups/{group_id}/...
drop policy if exists "group_avatar_manager_write" on storage.objects;
create policy "group_avatar_manager_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'group-avatars'
    and split_part(name, '/', 1) = 'groups'
    and public.is_group_owner_or_admin((split_part(name, '/', 2))::uuid)
  );

drop policy if exists "group_avatar_manager_update" on storage.objects;
create policy "group_avatar_manager_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'group-avatars'
    and split_part(name, '/', 1) = 'groups'
    and public.is_group_owner_or_admin((split_part(name, '/', 2))::uuid)
  )
  with check (
    bucket_id = 'group-avatars'
    and split_part(name, '/', 1) = 'groups'
    and public.is_group_owner_or_admin((split_part(name, '/', 2))::uuid)
  );

drop policy if exists "group_avatar_manager_delete" on storage.objects;
create policy "group_avatar_manager_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'group-avatars'
    and split_part(name, '/', 1) = 'groups'
    and public.is_group_owner_or_admin((split_part(name, '/', 2))::uuid)
  );

-- ================================================================
-- 8. Realtime (hangouts + responses + availability)
-- ================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'hangout_requests'
  ) then
    alter publication supabase_realtime add table public.hangout_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'hangout_responses'
  ) then
    alter publication supabase_realtime add table public.hangout_responses;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'availability'
  ) then
    alter publication supabase_realtime add table public.availability;
  end if;
end
$$;
