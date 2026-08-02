-- Moa shared workspace data layer.
--
-- This migration is intentionally self-contained and safe to run again:
-- tables/functions use IF NOT EXISTS/CREATE OR REPLACE, policies and triggers
-- are dropped before being recreated, and the circular idea/task foreign keys
-- are added only when they are missing.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  initials text,
  avatar_color text not null default 'mint',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null or char_length(btrim(display_name)) between 1 and 80
  ),
  constraint profiles_initials_length check (
    initials is null or char_length(btrim(initials)) between 1 and 8
  )
);

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'household',
  timezone text not null default 'Asia/Seoul',
  created_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spaces_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint spaces_type_length check (char_length(btrim(type)) between 1 and 40),
  constraint spaces_timezone_length check (char_length(btrim(timezone)) between 1 and 80)
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_role_check check (role in ('owner', 'admin', 'member')),
  constraint memberships_status_check check (status in ('active', 'removed', 'suspended')),
  constraint memberships_space_user_unique unique (space_id, user_id)
);

create table if not exists public.space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  code text not null default upper(substr(encode(gen_random_bytes(9), 'hex'), 1, 12)),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  max_uses integer,
  use_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint space_invites_code_unique unique (code),
  constraint space_invites_code_format check (code ~ '^[A-Z0-9]{12}$'),
  constraint space_invites_max_uses_check check (max_uses is null or max_uses > 0),
  constraint space_invites_use_count_check check (use_count >= 0),
  constraint space_invites_use_limit_check check (max_uses is null or use_count <= max_uses)
);

create table if not exists public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null,
  frequency text not null,
  weekdays smallint[] not null default '{}'::smallint[],
  day_of_month smallint,
  default_time time,
  assignee_id uuid references auth.users(id) on delete set null,
  category text not null default '기타',
  active boolean not null default true,
  next_due_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrence_rules_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint recurrence_rules_frequency_check check (frequency in ('daily', 'weekdays', 'weekly', 'monthly')),
  constraint recurrence_rules_weekdays_check check (
    weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  constraint recurrence_rules_day_of_month_check check (
    day_of_month is null or day_of_month between 1 and 31
  )
);

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null,
  body text,
  author_id uuid references auth.users(id) on delete set null,
  status text not null default 'inbox',
  converted_task_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ideas_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint ideas_body_length check (body is null or char_length(body) <= 5000),
  constraint ideas_status_check check (status in ('inbox', 'converted', 'archived')),
  constraint ideas_space_id_unique unique (id, space_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null,
  due_date date not null,
  due_time time,
  assignee_id uuid references auth.users(id) on delete set null,
  category text not null default '기타',
  note text,
  status text not null default 'open',
  -- The composite foreign key below prevents a task from using a rule in
  -- another space.
  recurrence_rule_id uuid,
  source_idea_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  postponed_at timestamptz,
  constraint tasks_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint tasks_note_length check (note is null or char_length(note) <= 5000),
  constraint tasks_status_check check (status in ('open', 'done')),
  constraint tasks_completion_consistency check (
    (status = 'done' and completed_at is not null)
    or (status = 'open' and completed_at is null)
  ),
  constraint tasks_space_id_unique unique (id, space_id),
  constraint tasks_source_idea_space_fkey
    foreign key (source_idea_id, space_id)
    references public.ideas(id, space_id)
    on delete restrict
);

-- The idea -> task side of the relationship is circular, so it is added after
-- both tables exist. The composite key prevents a task from another space
-- being attached to an idea in this space.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ideas_converted_task_space_fkey'
      and conrelid = 'public.ideas'::regclass
  ) then
    alter table public.ideas
      add constraint ideas_converted_task_space_fkey
      foreign key (converted_task_id, space_id)
      references public.tasks(id, space_id)
      on delete restrict;
  end if;
end
$$;

-- Repair the task-side circular FK if this file is rerun against a partially
-- created database that already had the tables but not the constraint.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_source_idea_space_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_source_idea_space_fkey
      foreign key (source_idea_id, space_id)
      references public.ideas(id, space_id)
      on delete restrict;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Indexes and invariants
-- ---------------------------------------------------------------------------

create index if not exists memberships_user_status_idx
  on public.memberships (user_id, status);

create index if not exists memberships_space_status_idx
  on public.memberships (space_id, status);

create index if not exists space_invites_space_active_idx
  on public.space_invites (space_id, revoked_at, expires_at);

create index if not exists recurrence_rules_space_active_idx
  on public.recurrence_rules (space_id, active);

create index if not exists tasks_space_due_date_idx
  on public.tasks (space_id, due_date, status);

create index if not exists tasks_space_assignee_idx
  on public.tasks (space_id, assignee_id, status);

create index if not exists tasks_recurrence_rule_idx
  on public.tasks (recurrence_rule_id, due_date);

create index if not exists ideas_space_status_idx
  on public.ideas (space_id, status, created_at desc);

create unique index if not exists tasks_recurrence_due_date_unique
  on public.tasks (recurrence_rule_id, due_date)
  where recurrence_rule_id is not null;

create unique index if not exists tasks_source_idea_unique
  on public.tasks (source_idea_id)
  where source_idea_id is not null;

-- Keep existing projects safe when this migration is re-run after the
-- original single-column recurrence foreign key was installed.
alter table public.space_invites
  alter column code set default upper(substr(encode(gen_random_bytes(9), 'hex'), 1, 12));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recurrence_rules_id_space_unique'
      and conrelid = 'public.recurrence_rules'::regclass
  ) then
    alter table public.recurrence_rules
      add constraint recurrence_rules_id_space_unique unique (id, space_id);
  end if;
end
$$;

-- Repair only impossible cross-space links before adding the stronger FK.
update public.tasks t
set recurrence_rule_id = null
where t.recurrence_rule_id is not null
  and not exists (
    select 1
    from public.recurrence_rules r
    where r.id = t.recurrence_rule_id
      and r.space_id = t.space_id
  );

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'tasks_recurrence_rule_id_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      drop constraint tasks_recurrence_rule_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_recurrence_rule_space_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_recurrence_rule_space_fkey
      foreign key (recurrence_rule_id, space_id)
      references public.recurrence_rules (id, space_id)
      on delete restrict;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Trigger helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.protect_space_scoped_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.space_id is distinct from old.space_id then
    raise exception 'space_id cannot be changed';
  end if;

  if tg_argv[0] = 'membership'
     and new.user_id is distinct from old.user_id then
    raise exception 'membership user_id cannot be changed';
  end if;

  if tg_argv[0] = 'invite'
     and (
       new.code is distinct from old.code
       or new.created_by is distinct from old.created_by
     ) then
    raise exception 'invite identity cannot be changed';
  end if;

  if tg_argv[0] = 'recurrence'
     and new.created_by is distinct from old.created_by then
    raise exception 'recurrence rule creator cannot be changed';
  end if;

  if tg_argv[0] = 'task'
     and (
       new.created_by is distinct from old.created_by
       or new.source_idea_id is distinct from old.source_idea_id
     ) then
    raise exception 'task identity cannot be changed';
  end if;

  if tg_argv[0] = 'idea'
     and new.author_id is distinct from old.author_id then
    raise exception 'idea author cannot be changed';
  end if;

  return new;
end;
$$;

create or replace function public.protect_space_creator()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'space creator cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.protect_last_space_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' and old.status = 'active' then
      select count(*) into v_remaining
      from public.memberships m
      where m.space_id = old.space_id
        and m.status = 'active'
        and m.role = 'owner'
        and m.id is distinct from old.id;

      if coalesce(v_remaining, 0) = 0 then
        raise exception 'cannot remove the last owner of a space';
      end if;
    end if;
    return old;
  end if;

  if old.role = 'owner'
     and old.status = 'active'
     and (
       new.role is distinct from 'owner'
       or new.status is distinct from 'active'
     ) then
    select count(*) into v_remaining
    from public.memberships m
    where m.space_id = old.space_id
      and m.status = 'active'
      and m.role = 'owner'
      and m.id is distinct from old.id;

    if coalesce(v_remaining, 0) = 0 then
      raise exception 'cannot remove the last owner of a space';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists spaces_set_updated_at on public.spaces;
create trigger spaces_set_updated_at
before update on public.spaces
for each row execute function public.set_updated_at();

drop trigger if exists spaces_protect_creator on public.spaces;
create trigger spaces_protect_creator
before update on public.spaces
for each row execute function public.protect_space_creator();

drop trigger if exists memberships_set_updated_at on public.memberships;
create trigger memberships_set_updated_at
before update on public.memberships
for each row execute function public.set_updated_at();

drop trigger if exists memberships_protect_identity on public.memberships;
create trigger memberships_protect_identity
before update on public.memberships
for each row execute function public.protect_space_scoped_identity('membership');

drop trigger if exists memberships_protect_last_owner on public.memberships;
create trigger memberships_protect_last_owner
before update of role, status or delete on public.memberships
for each row execute function public.protect_last_space_owner();

drop trigger if exists space_invites_set_updated_at on public.space_invites;
create trigger space_invites_set_updated_at
before update on public.space_invites
for each row execute function public.set_updated_at();

drop trigger if exists space_invites_protect_identity on public.space_invites;
create trigger space_invites_protect_identity
before update on public.space_invites
for each row execute function public.protect_space_scoped_identity('invite');

drop trigger if exists recurrence_rules_set_updated_at on public.recurrence_rules;
create trigger recurrence_rules_set_updated_at
before update on public.recurrence_rules
for each row execute function public.set_updated_at();

drop trigger if exists recurrence_rules_protect_identity on public.recurrence_rules;
create trigger recurrence_rules_protect_identity
before update on public.recurrence_rules
for each row execute function public.protect_space_scoped_identity('recurrence');

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists tasks_protect_identity on public.tasks;
create trigger tasks_protect_identity
before update on public.tasks
for each row execute function public.protect_space_scoped_identity('task');

drop trigger if exists ideas_set_updated_at on public.ideas;
create trigger ideas_set_updated_at
before update on public.ideas
for each row execute function public.set_updated_at();

drop trigger if exists ideas_protect_identity on public.ideas;
create trigger ideas_protect_identity
before update on public.ideas
for each row execute function public.protect_space_scoped_identity('idea');

-- ---------------------------------------------------------------------------
-- Auth/profile and authorization helpers
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    '모아 사용자'
  );

  insert into public.profiles (id, display_name, initials)
  values (new.id, v_display_name, left(v_display_name, 2))
  on conflict (id) do update
    set display_name = coalesce(excluded.display_name, public.profiles.display_name),
        initials = coalesce(excluded.initials, public.profiles.initials),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_active_space_member(
  p_space_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.memberships m
      where m.space_id = p_space_id
        and m.user_id = p_user_id
        and m.status = 'active'
    );
$$;

create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_space_member(p_space_id, auth.uid());
$$;

create or replace function public.is_space_admin(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.memberships m
      where m.space_id = p_space_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    );
$$;

create or replace function public.is_space_owner(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.memberships m
      where m.space_id = p_space_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role = 'owner'
    );
$$;

create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_profile_id = auth.uid()
    or exists (
      select 1
      from public.memberships mine
      join public.memberships theirs on theirs.space_id = mine.space_id
      where mine.user_id = auth.uid()
        and mine.status = 'active'
        and theirs.user_id = p_profile_id
        and theirs.status = 'active'
      );
$$;

create or replace function public.request_actor_id(p_actor_user_id uuid default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null then auth.uid()
    when auth.role() = 'service_role' then p_actor_user_id
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic domain operations
-- ---------------------------------------------------------------------------

create or replace function public.create_space(
  p_name text,
  p_type text default 'household',
  p_timezone text default 'Asia/Seoul'
)
returns public.spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.spaces;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 100 then
    raise exception 'space name must contain 1 to 100 characters';
  end if;

  insert into public.profiles (id, display_name, initials)
  values (v_user_id, '모아 사용자', '모아')
  on conflict (id) do nothing;

  insert into public.spaces (name, type, timezone, created_by)
  values (
    btrim(p_name),
    coalesce(nullif(btrim(p_type), ''), 'household'),
    coalesce(nullif(btrim(p_timezone), ''), 'Asia/Seoul'),
    v_user_id
  )
  returning * into v_space;

  insert into public.memberships (space_id, user_id, role, status)
  values (v_space.id, v_user_id, 'owner', 'active');

  return v_space;
end;
$$;

create or replace function public.create_space_invite(
  p_space_id uuid,
  p_expires_at timestamptz default null,
  p_max_uses integer default null
)
returns public.space_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.space_invites;
  v_expires_at timestamptz;
  v_max_uses integer;
begin
  if not public.is_space_admin(p_space_id) then
    raise exception 'space admin permission required';
  end if;

  v_expires_at := coalesce(p_expires_at, now() + interval '7 days');
  v_max_uses := coalesce(p_max_uses, 10);

  if v_expires_at <= now() then
    raise exception 'invite expiration must be in the future';
  end if;

  if v_max_uses <= 0 then
    raise exception 'max uses must be positive';
  end if;

  insert into public.space_invites (space_id, created_by, expires_at, max_uses)
  values (p_space_id, auth.uid(), v_expires_at, v_max_uses)
  returning * into v_invite;

  return v_invite;
end;
$$;

create or replace function public.join_space(p_invite_code text)
returns table (
  space_id uuid,
  membership_id uuid,
  role text,
  joined boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.space_invites;
  v_membership public.memberships;
  v_joined boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if p_invite_code is null or btrim(p_invite_code) = '' then
    raise exception 'invite code is required';
  end if;

  select * into v_invite
  from public.space_invites
  where code = upper(btrim(p_invite_code))
  for update;

  if not found
     or v_invite.revoked_at is not null
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or (v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses) then
    raise exception 'invite code is invalid or expired';
  end if;

  select * into v_membership
  from public.memberships
  where space_id = v_invite.space_id
    and user_id = v_user_id
  for update;

  if found and v_membership.status = 'active' then
    return query
      select v_membership.space_id, v_membership.id, v_membership.role, false;
    return;
  end if;

  if found and v_membership.status = 'suspended' then
    raise exception 'membership is suspended';
  end if;

  if found then
    update public.memberships
    set status = 'active',
        role = case when role in ('owner', 'admin') then role else 'member' end,
        invited_by = coalesce(invited_by, v_invite.created_by),
        updated_at = now()
    where id = v_membership.id
    returning * into v_membership;
  else
    insert into public.memberships (space_id, user_id, role, status, invited_by)
    values (v_invite.space_id, v_user_id, 'member', 'active', v_invite.created_by)
    returning * into v_membership;
  end if;

  update public.space_invites
  set use_count = use_count + 1,
      updated_at = now()
  where id = v_invite.id;

  v_joined := true;
  return query
    select v_membership.space_id, v_membership.id, v_membership.role, v_joined;
end;
$$;

create or replace function public.next_recurrence_date(
  p_frequency text,
  p_weekdays smallint[],
  p_day_of_month smallint,
  p_after date
)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v_candidate date;
  v_first_day date;
  v_last_day date;
  v_weekdays smallint[];
  v_day integer;
  v_offset integer;
begin
  if p_after is null then
    return null;
  end if;

  if p_frequency = 'daily' then
    return p_after + 1;
  end if;

  if p_frequency = 'weekdays' then
    for v_day in 1..7 loop
      v_candidate := p_after + v_day;
      if extract(isodow from v_candidate)::integer between 1 and 5 then
        return v_candidate;
      end if;
    end loop;
  end if;

  if p_frequency = 'weekly' then
    v_weekdays := coalesce(p_weekdays, '{}'::smallint[]);
    if cardinality(v_weekdays) = 0 then
      v_weekdays := array[extract(dow from p_after)::smallint];
    end if;

    for v_day in 1..7 loop
      v_candidate := p_after + v_day;
      if extract(dow from v_candidate)::smallint = any(v_weekdays) then
        return v_candidate;
      end if;
    end loop;
  end if;

  if p_frequency = 'monthly' then
    v_first_day := (date_trunc('month', p_after::timestamp) + interval '1 month')::date;
    v_last_day := ((v_first_day::timestamp + interval '1 month')::date - 1);
    v_offset := least(
      coalesce(p_day_of_month::integer, extract(day from p_after)::integer),
      extract(day from v_last_day)::integer
    ) - 1;
    return v_first_day + v_offset;
  end if;

  return null;
end;
$$;

drop function if exists public.create_task(uuid, text, date, time, uuid, text, text, text);

create or replace function public.create_task(
  p_space_id uuid,
  p_title text,
  p_due_date date,
  p_due_time time default null,
  p_assignee_id uuid default null,
  p_category text default '기타',
  p_note text default null,
  p_frequency text default 'none',
  p_actor_user_id uuid default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_user_id uuid := public.request_actor_id(p_actor_user_id);
  v_rule_id uuid;
  v_assignee_id uuid := coalesce(p_assignee_id, v_user_id);
  v_weekdays smallint[] := '{}'::smallint[];
  v_day_of_month smallint;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if not public.is_active_space_member(p_space_id, v_user_id) then
    raise exception 'space membership required';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'task title must contain 1 to 200 characters';
  end if;

  if p_due_date is null then
    raise exception 'due date is required';
  end if;

  if not public.is_active_space_member(p_space_id, v_assignee_id) then
    raise exception 'assignee must be an active space member';
  end if;

  if p_frequency not in ('none', 'daily', 'weekdays', 'weekly', 'monthly') then
    raise exception 'unsupported recurrence frequency';
  end if;

  if p_frequency = 'weekly' then
    v_weekdays := array[extract(dow from p_due_date)::smallint];
  elsif p_frequency = 'monthly' then
    v_day_of_month := extract(day from p_due_date)::smallint;
  end if;

  if p_frequency <> 'none' then
    insert into public.recurrence_rules (
      space_id,
      title,
      frequency,
      weekdays,
      day_of_month,
      default_time,
      assignee_id,
      category,
      next_due_date,
      created_by
    )
    values (
      p_space_id,
      btrim(p_title),
      p_frequency,
      v_weekdays,
      v_day_of_month,
      p_due_time,
      v_assignee_id,
      coalesce(nullif(btrim(p_category), ''), '기타'),
      public.next_recurrence_date(p_frequency, v_weekdays, v_day_of_month, p_due_date),
      v_user_id
    )
    returning id into v_rule_id;
  end if;

  insert into public.tasks (
    space_id,
    title,
    due_date,
    due_time,
    assignee_id,
    category,
    note,
    status,
    recurrence_rule_id,
    created_by
  )
  values (
    p_space_id,
    btrim(p_title),
    p_due_date,
    p_due_time,
    v_assignee_id,
    coalesce(nullif(btrim(p_category), ''), '기타'),
    nullif(btrim(p_note), ''),
    'open',
    v_rule_id,
    v_user_id
  )
  returning * into v_task;

  return v_task;
end;
$$;

drop function if exists public.update_task(uuid, text, date, time, uuid, text, text, text);

create or replace function public.update_task(
  p_task_id uuid,
  p_title text,
  p_due_date date,
  p_due_time time default null,
  p_assignee_id uuid default null,
  p_category text default '기타',
  p_note text default null,
  p_frequency text default 'none',
  p_actor_user_id uuid default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_user_id uuid := public.request_actor_id(p_actor_user_id);
  v_rule public.recurrence_rules;
  v_rule_id uuid;
  v_assignee_id uuid := coalesce(p_assignee_id, v_user_id);
  v_weekdays smallint[] := '{}'::smallint[];
  v_day_of_month smallint;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select *
  into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'task not found';
  end if;

  if not public.is_active_space_member(v_task.space_id, v_user_id) then
    raise exception 'space membership required';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'task title must contain 1 to 200 characters';
  end if;

  if p_due_date is null then
    raise exception 'due date is required';
  end if;

  if not public.is_active_space_member(v_task.space_id, v_assignee_id) then
    raise exception 'assignee must be an active space member';
  end if;

  if p_frequency not in ('none', 'daily', 'weekdays', 'weekly', 'monthly') then
    raise exception 'unsupported recurrence frequency';
  end if;

  if p_frequency = 'weekly' then
    v_weekdays := array[extract(dow from p_due_date)::smallint];
  elsif p_frequency = 'monthly' then
    v_day_of_month := extract(day from p_due_date)::smallint;
  end if;

  if p_frequency = 'none' then
    if v_task.recurrence_rule_id is not null then
      update public.recurrence_rules
      set active = false,
          updated_at = now()
      where id = v_task.recurrence_rule_id;
    end if;
    v_rule_id := null;
  elsif v_task.recurrence_rule_id is not null then
    v_rule_id := v_task.recurrence_rule_id;
    update public.recurrence_rules
    set title = btrim(p_title),
        frequency = p_frequency,
        weekdays = v_weekdays,
        day_of_month = v_day_of_month,
        default_time = p_due_time,
        assignee_id = v_assignee_id,
        category = coalesce(nullif(btrim(p_category), ''), '기타'),
        active = true,
        next_due_date = public.next_recurrence_date(
          p_frequency,
          v_weekdays,
          v_day_of_month,
          p_due_date
        ),
        updated_at = now()
    where id = v_rule_id;
  else
    insert into public.recurrence_rules (
      space_id,
      title,
      frequency,
      weekdays,
      day_of_month,
      default_time,
      assignee_id,
      category,
      next_due_date,
      created_by
    )
    values (
      v_task.space_id,
      btrim(p_title),
      p_frequency,
      v_weekdays,
      v_day_of_month,
      p_due_time,
      v_assignee_id,
      coalesce(nullif(btrim(p_category), ''), '기타'),
      public.next_recurrence_date(
        p_frequency,
        v_weekdays,
        v_day_of_month,
        p_due_date
      ),
      v_user_id
    )
    returning id into v_rule_id;
  end if;

  update public.tasks
  set title = btrim(p_title),
      due_date = p_due_date,
      due_time = p_due_time,
      assignee_id = v_assignee_id,
      category = coalesce(nullif(btrim(p_category), ''), '기타'),
      note = nullif(btrim(p_note), ''),
      recurrence_rule_id = v_rule_id
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

create or replace function public.create_next_task_occurrence(p_task_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_rule public.recurrence_rules;
  v_next_date date;
  v_next_task_id uuid;
begin
  select * into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found or v_task.recurrence_rule_id is null then
    return null;
  end if;

  select * into v_rule
  from public.recurrence_rules
  where id = v_task.recurrence_rule_id
  for update;

  if not found or not v_rule.active then
    return null;
  end if;

  v_next_date := public.next_recurrence_date(
    v_rule.frequency,
    v_rule.weekdays,
    v_rule.day_of_month,
    v_task.due_date
  );

  if v_next_date is null then
    return null;
  end if;

  insert into public.tasks (
    space_id,
    title,
    due_date,
    due_time,
    assignee_id,
    category,
    note,
    status,
    recurrence_rule_id,
    created_by
  )
  values (
    v_task.space_id,
    v_rule.title,
    v_next_date,
    v_rule.default_time,
    v_rule.assignee_id,
    v_rule.category,
    null,
    'open',
    v_rule.id,
    v_rule.created_by
  )
  on conflict (recurrence_rule_id, due_date)
    where recurrence_rule_id is not null
    do nothing
  returning id into v_next_task_id;

  if v_next_task_id is null then
    select id into v_next_task_id
    from public.tasks
    where recurrence_rule_id = v_rule.id
      and due_date = v_next_date;
  end if;

  update public.recurrence_rules
  set next_due_date = v_next_date,
      updated_at = now()
  where id = v_rule.id;

  return v_next_task_id;
end;
$$;

drop function if exists public.complete_task(uuid, boolean);

create or replace function public.complete_task(
  p_task_id uuid,
  p_completed boolean default true,
  p_actor_user_id uuid default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_user_id uuid := public.request_actor_id(p_actor_user_id);
  v_done boolean := coalesce(p_completed, true);
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'task not found';
  end if;

  if not public.is_active_space_member(v_task.space_id, v_user_id) then
    raise exception 'space membership required';
  end if;

  update public.tasks
  set status = case when v_done then 'done' else 'open' end,
      completed_at = case when v_done then coalesce(completed_at, now()) else null end
  where id = p_task_id
  returning * into v_task;

  if v_done then
    perform public.create_next_task_occurrence(v_task.id);
  end if;

  return v_task;
end;
$$;

drop function if exists public.postpone_task(uuid);

create or replace function public.postpone_task(
  p_task_id uuid,
  p_actor_user_id uuid default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_user_id uuid := public.request_actor_id(p_actor_user_id);
  v_space_timezone text;
  v_base_date date;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select t.*
  into v_task
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    raise exception 'task not found';
  end if;

  select s.timezone
  into v_space_timezone
  from public.spaces s
  where s.id = v_task.space_id;

  if not public.is_active_space_member(v_task.space_id, v_user_id) then
    raise exception 'space membership required';
  end if;

  if v_task.status = 'done' then
    return v_task;
  end if;

  v_base_date := greatest(
    v_task.due_date,
    timezone(v_space_timezone, now())::date
  );

  update public.tasks
  set due_date = v_base_date + 1,
      postponed_at = now()
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

create or replace function public.archive_idea(
  p_idea_id uuid,
  p_archived boolean default true
)
returns public.ideas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idea public.ideas;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_idea
  from public.ideas
  where id = p_idea_id
  for update;

  if not found then
    raise exception 'idea not found';
  end if;

  if not public.is_space_member(v_idea.space_id) then
    raise exception 'space membership required';
  end if;

  update public.ideas
  set status = case
    when p_archived then 'archived'
    when converted_task_id is not null then 'converted'
    else 'inbox'
  end
  where id = p_idea_id
  returning * into v_idea;

  return v_idea;
end;
$$;

drop function if exists public.convert_idea_to_task(uuid, date, time, uuid, text, text, text);

create or replace function public.convert_idea_to_task(
  p_idea_id uuid,
  p_due_date date default current_date,
  p_due_time time default null,
  p_assignee_id uuid default null,
  p_category text default '기타',
  p_note text default null,
  p_frequency text default 'none',
  p_actor_user_id uuid default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idea public.ideas;
  v_task public.tasks;
  v_user_id uuid := public.request_actor_id(p_actor_user_id);
  v_rule_id uuid;
  v_assignee_id uuid := coalesce(p_assignee_id, v_user_id);
  v_weekdays smallint[] := '{}'::smallint[];
  v_day_of_month smallint;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_idea
  from public.ideas
  where id = p_idea_id
  for update;

  if not found then
    raise exception 'idea not found';
  end if;

  if not public.is_active_space_member(v_idea.space_id, v_user_id) then
    raise exception 'space membership required';
  end if;

  if v_idea.converted_task_id is not null then
    select * into v_task
    from public.tasks
    where id = v_idea.converted_task_id;
    if found then
      return v_task;
    end if;
  end if;

  if p_due_date is null then
    raise exception 'due date is required';
  end if;

  if not public.is_active_space_member(v_idea.space_id, v_assignee_id) then
    raise exception 'assignee must be an active space member';
  end if;

  if p_frequency not in ('none', 'daily', 'weekdays', 'weekly', 'monthly') then
    raise exception 'unsupported recurrence frequency';
  end if;

  if p_frequency = 'weekly' then
    v_weekdays := array[extract(dow from p_due_date)::smallint];
  elsif p_frequency = 'monthly' then
    v_day_of_month := extract(day from p_due_date)::smallint;
  end if;

  if p_frequency <> 'none' then
    insert into public.recurrence_rules (
      space_id,
      title,
      frequency,
      weekdays,
      day_of_month,
      default_time,
      assignee_id,
      category,
      next_due_date,
      created_by
    )
    values (
      v_idea.space_id,
      v_idea.title,
      p_frequency,
      v_weekdays,
      v_day_of_month,
      p_due_time,
      v_assignee_id,
      coalesce(nullif(btrim(p_category), ''), '기타'),
      public.next_recurrence_date(p_frequency, v_weekdays, v_day_of_month, p_due_date),
      v_user_id
    )
    returning id into v_rule_id;
  end if;

  insert into public.tasks (
    space_id,
    title,
    due_date,
    due_time,
    assignee_id,
    category,
    note,
    status,
    recurrence_rule_id,
    source_idea_id,
    created_by
  )
  values (
    v_idea.space_id,
    v_idea.title,
    p_due_date,
    p_due_time,
    v_assignee_id,
    coalesce(nullif(btrim(p_category), ''), '기타'),
    coalesce(nullif(btrim(p_note), ''), v_idea.body),
    'open',
    v_rule_id,
    v_idea.id,
    v_user_id
  )
  on conflict (source_idea_id)
    where source_idea_id is not null
    do nothing
  returning * into v_task;

  if v_task.id is null then
    select * into v_task
    from public.tasks
    where source_idea_id = v_idea.id;
  end if;

  update public.ideas
  set status = 'converted',
      converted_task_id = v_task.id
  where id = v_idea.id;

  return v_task;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.memberships enable row level security;
alter table public.space_invites enable row level security;
alter table public.recurrence_rules enable row level security;
alter table public.tasks enable row level security;
alter table public.ideas enable row level security;

drop policy if exists profiles_select_visible on public.profiles;
create policy profiles_select_visible
on public.profiles
for select to authenticated
using (public.can_view_profile(id));

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists spaces_select_members on public.spaces;
create policy spaces_select_members
on public.spaces
for select to authenticated
using (public.is_space_member(id));

drop policy if exists spaces_update_admins on public.spaces;
create policy spaces_update_admins
on public.spaces
for update to authenticated
using (public.is_space_admin(id))
with check (public.is_space_admin(id));

drop policy if exists memberships_select_active_space on public.memberships;
create policy memberships_select_active_space
on public.memberships
for select to authenticated
using (status = 'active' and public.is_space_member(space_id));

drop policy if exists memberships_delete_self_or_admin on public.memberships;
create policy memberships_delete_self_or_admin
on public.memberships
for delete to authenticated
using (user_id = auth.uid() or public.is_space_admin(space_id));

drop policy if exists space_invites_select_members on public.space_invites;
create policy space_invites_select_members
on public.space_invites
for select to authenticated
using (revoked_at is null and public.is_space_member(space_id));

drop policy if exists space_invites_insert_admins on public.space_invites;
create policy space_invites_insert_admins
on public.space_invites
for insert to authenticated
with check (public.is_space_admin(space_id) and created_by = auth.uid());

drop policy if exists space_invites_update_admins on public.space_invites;
create policy space_invites_update_admins
on public.space_invites
for update to authenticated
using (public.is_space_admin(space_id))
with check (public.is_space_admin(space_id));

drop policy if exists space_invites_delete_admins on public.space_invites;
create policy space_invites_delete_admins
on public.space_invites
for delete to authenticated
using (public.is_space_admin(space_id));

drop policy if exists recurrence_rules_select_members on public.recurrence_rules;
create policy recurrence_rules_select_members
on public.recurrence_rules
for select to authenticated
using (public.is_space_member(space_id));

drop policy if exists recurrence_rules_insert_members on public.recurrence_rules;
create policy recurrence_rules_insert_members
on public.recurrence_rules
for insert to authenticated
with check (
  public.is_space_member(space_id)
  and created_by = auth.uid()
  and (
    assignee_id is null
    or public.is_active_space_member(space_id, assignee_id)
  )
);

drop policy if exists recurrence_rules_update_members on public.recurrence_rules;
create policy recurrence_rules_update_members
on public.recurrence_rules
for update to authenticated
using (public.is_space_member(space_id))
with check (
  public.is_space_member(space_id)
  and (
    assignee_id is null
    or public.is_active_space_member(space_id, assignee_id)
  )
);

drop policy if exists recurrence_rules_delete_creator_or_admin on public.recurrence_rules;
create policy recurrence_rules_delete_creator_or_admin
on public.recurrence_rules
for delete to authenticated
using (created_by = auth.uid() or public.is_space_admin(space_id));

drop policy if exists tasks_select_members on public.tasks;
create policy tasks_select_members
on public.tasks
for select to authenticated
using (public.is_space_member(space_id));

drop policy if exists tasks_insert_members on public.tasks;
create policy tasks_insert_members
on public.tasks
for insert to authenticated
with check (
  public.is_space_member(space_id)
  and created_by = auth.uid()
  and (
    assignee_id is null
    or public.is_active_space_member(space_id, assignee_id)
  )
);

drop policy if exists tasks_update_members on public.tasks;
create policy tasks_update_members
on public.tasks
for update to authenticated
using (public.is_space_member(space_id))
with check (
  public.is_space_member(space_id)
  and (
    assignee_id is null
    or public.is_active_space_member(space_id, assignee_id)
  )
);

drop policy if exists tasks_delete_creator_or_admin on public.tasks;
create policy tasks_delete_creator_or_admin
on public.tasks
for delete to authenticated
using (created_by = auth.uid() or public.is_space_admin(space_id));

drop policy if exists ideas_select_members on public.ideas;
create policy ideas_select_members
on public.ideas
for select to authenticated
using (public.is_space_member(space_id));

drop policy if exists ideas_insert_members on public.ideas;
create policy ideas_insert_members
on public.ideas
for insert to authenticated
with check (
  public.is_space_member(space_id)
  and author_id = auth.uid()
  and status = 'inbox'
  and converted_task_id is null
);

drop policy if exists ideas_update_members on public.ideas;
create policy ideas_update_members
on public.ideas
for update to authenticated
using (public.is_space_member(space_id))
with check (public.is_space_member(space_id));

drop policy if exists ideas_delete_author_or_admin on public.ideas;
create policy ideas_delete_author_or_admin
on public.ideas
for delete to authenticated
using (author_id = auth.uid() or public.is_space_admin(space_id));

-- ---------------------------------------------------------------------------
-- Privileges and realtime publication
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

revoke all on table
  public.profiles,
  public.spaces,
  public.memberships,
  public.space_invites,
  public.recurrence_rules,
  public.tasks,
  public.ideas
from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, update on table public.spaces to authenticated;
grant select, delete on table public.memberships to authenticated;
grant select on table public.space_invites to authenticated;
grant select on table public.recurrence_rules to authenticated;
grant update (active) on table public.recurrence_rules to authenticated;
grant select on table public.tasks to authenticated;
grant select, insert, delete on table public.ideas to authenticated;
grant update (title, body) on table public.ideas to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.protect_space_scoped_identity() from public, anon, authenticated;
revoke all on function public.protect_space_creator() from public, anon, authenticated;
revoke all on function public.protect_last_space_owner() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_active_space_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_space_member(uuid) from public, anon, authenticated;
revoke all on function public.is_space_admin(uuid) from public, anon, authenticated;
revoke all on function public.is_space_owner(uuid) from public, anon, authenticated;
revoke all on function public.can_view_profile(uuid) from public, anon, authenticated;
revoke all on function public.request_actor_id(uuid) from public, anon, authenticated;
revoke all on function public.next_recurrence_date(text, smallint[], smallint, date) from public, anon, authenticated;
revoke all on function public.create_next_task_occurrence(uuid) from public, anon, authenticated;
revoke all on function public.create_space(text, text, text) from public, anon, authenticated;
revoke all on function public.create_space_invite(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.join_space(text) from public, anon, authenticated;
revoke all on function public.create_task(uuid, text, date, time, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_task(uuid, text, date, time, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_task(uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.postpone_task(uuid, uuid) from public, anon, authenticated;
revoke all on function public.archive_idea(uuid, boolean) from public, anon, authenticated;
revoke all on function public.convert_idea_to_task(uuid, date, time, uuid, text, text, text, uuid) from public, anon, authenticated;

grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.is_space_admin(uuid) to authenticated;
grant execute on function public.is_space_owner(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.create_space(text, text, text) to authenticated;
grant execute on function public.create_space_invite(uuid, timestamptz, integer) to authenticated;
grant execute on function public.join_space(text) to authenticated;
grant execute on function public.create_task(uuid, text, date, time, uuid, text, text, text, uuid) to authenticated, service_role;
grant execute on function public.update_task(uuid, text, date, time, uuid, text, text, text, uuid) to authenticated, service_role;
grant execute on function public.complete_task(uuid, boolean, uuid) to authenticated, service_role;
grant execute on function public.postpone_task(uuid, uuid) to authenticated, service_role;
grant execute on function public.archive_idea(uuid, boolean) to authenticated;
grant execute on function public.convert_idea_to_task(uuid, date, time, uuid, text, text, text, uuid) to authenticated, service_role;

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'spaces',
      'memberships',
      'recurrence_rules',
      'tasks',
      'ideas'
    ] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      exception
        when duplicate_object then null;
      end;
    end loop;
  end if;
end
$$;
