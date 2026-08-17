-- Space notes: markdown documents, tags, wiki links, assets, and unlisted public pages.
-- Safe to run again: IF NOT EXISTS / CREATE OR REPLACE, policies dropped before recreate.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null,
  body_md text not null default '',
  author_id uuid references auth.users(id) on delete set null,
  publish_token text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint notes_body_length check (char_length(body_md) <= 102400),
  constraint notes_space_id_unique unique (id, space_id),
  constraint notes_publish_token_unique unique (publish_token)
);

create table if not exists public.note_tags (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null,
  space_id uuid not null,
  tag text not null,
  created_at timestamptz not null default now(),
  constraint note_tags_tag_format check (tag ~ '^[a-z0-9가-힣_-]{1,40}$'),
  constraint note_tags_note_tag_unique unique (note_id, tag),
  constraint note_tags_note_space_fkey
    foreign key (note_id, space_id)
    references public.notes (id, space_id)
    on delete cascade
);

create table if not exists public.note_links (
  id uuid primary key default gen_random_uuid(),
  from_note_id uuid not null,
  to_note_id uuid,
  space_id uuid not null,
  raw_title text not null,
  created_at timestamptz not null default now(),
  constraint note_links_raw_title_length check (char_length(btrim(raw_title)) between 1 and 200),
  constraint note_links_from_space_fkey
    foreign key (from_note_id, space_id)
    references public.notes (id, space_id)
    on delete cascade,
  constraint note_links_to_space_fkey
    foreign key (to_note_id, space_id)
    references public.notes (id, space_id)
    on delete set null
);

create table if not exists public.note_assets (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null,
  space_id uuid not null,
  storage_path text not null,
  mime text not null,
  byte_size integer not null,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  constraint note_assets_mime_check check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint note_assets_size_check check (byte_size > 0 and byte_size <= 5242880),
  constraint note_assets_path_length check (char_length(storage_path) between 10 and 400),
  constraint note_assets_storage_path_unique unique (storage_path),
  constraint note_assets_note_space_fkey
    foreign key (note_id, space_id)
    references public.notes (id, space_id)
    on delete cascade
);

create index if not exists notes_space_updated_idx
  on public.notes (space_id, updated_at desc);

create index if not exists notes_space_title_idx
  on public.notes (space_id, lower(title));

create unique index if not exists notes_publish_token_live_idx
  on public.notes (publish_token)
  where publish_token is not null;

create index if not exists note_tags_space_tag_idx
  on public.note_tags (space_id, tag);

create index if not exists note_links_from_idx
  on public.note_links (from_note_id);

create index if not exists note_links_to_idx
  on public.note_links (to_note_id);

create index if not exists note_assets_note_idx
  on public.note_assets (note_id);

alter table public.notes enable row level security;
alter table public.note_tags enable row level security;
alter table public.note_links enable row level security;
alter table public.note_assets enable row level security;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

drop trigger if exists notes_protect_identity on public.notes;
create trigger notes_protect_identity
before update on public.notes
for each row execute function public.protect_space_scoped_identity('note');

create or replace function public.protect_note_author()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.author_id is distinct from old.author_id then
    raise exception 'note author cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists notes_protect_author on public.notes;
create trigger notes_protect_author
before update on public.notes
for each row execute function public.protect_note_author();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.new_note_publish_token()
returns text
language sql
volatile
as $$
  select encode(gen_random_bytes(24), 'hex');
$$;

create or replace function public.extract_note_tags(p_body text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct tag), '{}'::text[])
  from (
    select lower(m[1]) as tag
    from regexp_matches(coalesce(p_body, ''), '#([A-Za-z0-9가-힣_-]{1,40})', 'g') as m
  ) extracted
  where tag ~ '^[a-z0-9가-힣_-]{1,40}$';
$$;

create or replace function public.extract_note_wiki_titles(p_body text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct btrim(title)), '{}'::text[])
  from (
    select m[1] as title
    from regexp_matches(coalesce(p_body, ''), '\[\[([^\[\]]{1,200})\]\]', 'g') as m
  ) extracted
  where char_length(btrim(title)) between 1 and 200;
$$;

create or replace function public.reindex_note_refs(p_note public.notes)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag text;
  v_title text;
  v_target uuid;
begin
  delete from public.note_tags where note_id = p_note.id;
  foreach v_tag in array public.extract_note_tags(p_note.body_md || ' ' || p_note.title)
  loop
    insert into public.note_tags (note_id, space_id, tag)
    values (p_note.id, p_note.space_id, v_tag)
    on conflict (note_id, tag) do nothing;
  end loop;

  delete from public.note_links where from_note_id = p_note.id;
  foreach v_title in array public.extract_note_wiki_titles(p_note.body_md)
  loop
    select n.id into v_target
    from public.notes n
    where n.space_id = p_note.space_id
      and n.id <> p_note.id
      and lower(btrim(n.title)) = lower(btrim(v_title))
    order by n.updated_at desc
    limit 1;

    insert into public.note_links (from_note_id, to_note_id, space_id, raw_title)
    values (p_note.id, v_target, p_note.space_id, btrim(v_title));
  end loop;
end;
$$;

create or replace function public.storage_uuid_segment(p_name text, p_index integer)
returns uuid
language plpgsql
stable
as $$
declare
  v_part text;
begin
  v_part := (storage.foldername(p_name))[p_index];
  if v_part is null or v_part !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v_part::uuid;
end;
$$;

create or replace function public.note_image_is_published(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notes n
    where n.publish_token is not null
      and n.published_at is not null
      and n.space_id = public.storage_uuid_segment(p_name, 1)
      and n.id = public.storage_uuid_segment(p_name, 2)
  );
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.list_notes(p_space_id uuid)
returns table (
  id uuid,
  space_id uuid,
  title text,
  body_md text,
  author_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz,
  publish_token text,
  tags text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'space membership required';
  end if;

  return query
  select
    n.id,
    n.space_id,
    n.title,
    n.body_md,
    n.author_id,
    n.created_at,
    n.updated_at,
    n.published_at,
    n.publish_token,
    coalesce((
      select array_agg(t.tag order by t.tag)
      from public.note_tags t
      where t.note_id = n.id
    ), '{}'::text[]) as tags
  from public.notes n
  where n.space_id = p_space_id
  order by n.updated_at desc;
end;
$$;

create or replace function public.list_note_links(p_space_id uuid)
returns table (
  id uuid,
  from_note_id uuid,
  to_note_id uuid,
  raw_title text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'space membership required';
  end if;

  return query
  select l.id, l.from_note_id, l.to_note_id, l.raw_title
  from public.note_links l
  where l.space_id = p_space_id;
end;
$$;

create or replace function public.list_note_tags(p_space_id uuid)
returns table (
  tag text,
  note_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'space membership required';
  end if;

  return query
  select t.tag, count(*)::bigint as note_count
  from public.note_tags t
  where t.space_id = p_space_id
  group by t.tag
  order by count(*) desc, t.tag;
end;
$$;

create or replace function public.upsert_note(
  p_space_id uuid,
  p_title text,
  p_body_md text default '',
  p_note_id uuid default null
)
returns public.notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_note public.notes;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := coalesce(p_body_md, '');
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if not public.is_active_space_member(p_space_id, v_user_id) then
    raise exception 'space membership required';
  end if;

  if char_length(v_title) not between 1 and 200 then
    raise exception 'note title must contain 1 to 200 characters';
  end if;

  if char_length(v_body) > 102400 then
    raise exception 'note body is too long';
  end if;

  if p_note_id is null then
    insert into public.notes (space_id, title, body_md, author_id)
    values (p_space_id, v_title, v_body, v_user_id)
    returning * into v_note;
  else
    select * into v_note
    from public.notes
    where id = p_note_id
      and space_id = p_space_id
    for update;

    if not found then
      raise exception 'note not found';
    end if;

    update public.notes
    set title = v_title,
        body_md = v_body
    where id = p_note_id
    returning * into v_note;
  end if;

  perform public.reindex_note_refs(v_note);
  return v_note;
end;
$$;

create or replace function public.delete_note(p_note_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.notes;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_note
  from public.notes
  where id = p_note_id
  for update;

  if not found then
    raise exception 'note not found';
  end if;

  if not public.is_space_member(v_note.space_id) then
    raise exception 'space membership required';
  end if;

  if v_note.author_id is distinct from auth.uid()
     and not public.is_space_admin(v_note.space_id) then
    raise exception 'note delete permission required';
  end if;

  delete from public.notes where id = p_note_id;
  return p_note_id;
end;
$$;

create or replace function public.set_note_published(
  p_note_id uuid,
  p_publish boolean
)
returns public.notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.notes;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_note
  from public.notes
  where id = p_note_id
  for update;

  if not found then
    raise exception 'note not found';
  end if;

  if not public.is_active_space_member(v_note.space_id, auth.uid()) then
    raise exception 'space membership required';
  end if;

  if p_publish then
    update public.notes
    set publish_token = coalesce(publish_token, public.new_note_publish_token()),
        published_at = coalesce(published_at, now())
    where id = p_note_id
    returning * into v_note;
  else
    update public.notes
    set publish_token = null,
        published_at = null
    where id = p_note_id
    returning * into v_note;
  end if;

  return v_note;
end;
$$;

create or replace function public.rotate_note_publish_token(p_note_id uuid)
returns public.notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.notes;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_note
  from public.notes
  where id = p_note_id
  for update;

  if not found then
    raise exception 'note not found';
  end if;

  if not public.is_active_space_member(v_note.space_id, auth.uid()) then
    raise exception 'space membership required';
  end if;

  if v_note.publish_token is null then
    raise exception 'note is not published';
  end if;

  update public.notes
  set publish_token = public.new_note_publish_token(),
      published_at = now()
  where id = p_note_id
  returning * into v_note;

  return v_note;
end;
$$;

create or replace function public.get_published_note(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_note public.notes;
  v_space_name text;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'publish token is required';
  end if;

  select * into v_note
  from public.notes
  where publish_token = btrim(p_token)
    and published_at is not null;

  if not found then
    raise exception 'published note not found';
  end if;

  select s.name into v_space_name
  from public.spaces s
  where s.id = v_note.space_id;

  return jsonb_build_object(
    'id', v_note.id,
    'title', v_note.title,
    'body_md', v_note.body_md,
    'published_at', v_note.published_at,
    'space_name', coalesce(v_space_name, ''),
    'tags', coalesce((
      select jsonb_agg(t.tag order by t.tag)
      from public.note_tags t
      where t.note_id = v_note.id
    ), '[]'::jsonb),
    'assets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'storage_path', a.storage_path,
        'mime', a.mime
      ) order by a.created_at)
      from public.note_assets a
      where a.note_id = v_note.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_note_asset(
  p_note_id uuid,
  p_mime text,
  p_byte_size integer,
  p_width integer default null,
  p_height integer default null
)
returns public.note_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.notes;
  v_asset public.note_assets;
  v_ext text;
  v_count integer;
  v_asset_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_note
  from public.notes
  where id = p_note_id
  for update;

  if not found then
    raise exception 'note not found';
  end if;

  if not public.is_active_space_member(v_note.space_id, auth.uid()) then
    raise exception 'space membership required';
  end if;

  if p_mime not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'unsupported image type';
  end if;

  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 5242880 then
    raise exception 'image is too large';
  end if;

  select count(*) into v_count
  from public.note_assets
  where note_id = p_note_id;

  if v_count >= 20 then
    raise exception 'note image limit reached';
  end if;

  v_ext := case p_mime
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    else 'jpg'
  end;

  insert into public.note_assets (
    id,
    note_id,
    space_id,
    storage_path,
    mime,
    byte_size,
    width,
    height
  )
  values (
    v_asset_id,
    v_note.id,
    v_note.space_id,
    v_note.space_id::text || '/' || v_note.id::text || '/' || v_asset_id::text || '.' || v_ext,
    p_mime,
    p_byte_size,
    p_width,
    p_height
  )
  returning * into v_asset;

  return v_asset;
end;
$$;

create or replace function public.delete_note_asset(p_asset_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.note_assets;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_asset
  from public.note_assets
  where id = p_asset_id
  for update;

  if not found then
    raise exception 'asset not found';
  end if;

  if not public.is_space_member(v_asset.space_id) then
    raise exception 'space membership required';
  end if;

  delete from public.note_assets where id = p_asset_id;
  return p_asset_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

drop policy if exists notes_select_members on public.notes;
create policy notes_select_members
on public.notes
for select to authenticated
using (public.is_space_member(space_id));

drop policy if exists note_tags_select_members on public.note_tags;
create policy note_tags_select_members
on public.note_tags
for select to authenticated
using (public.is_space_member(space_id));

drop policy if exists note_links_select_members on public.note_links;
create policy note_links_select_members
on public.note_links
for select to authenticated
using (public.is_space_member(space_id));

drop policy if exists note_assets_select_members on public.note_assets;
create policy note_assets_select_members
on public.note_assets
for select to authenticated
using (public.is_space_member(space_id));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on table
  public.notes,
  public.note_tags,
  public.note_links,
  public.note_assets
from anon, authenticated;

grant select on table public.notes to authenticated;
grant select on table public.note_tags to authenticated;
grant select on table public.note_links to authenticated;
grant select on table public.note_assets to authenticated;

revoke all on function public.new_note_publish_token() from public, anon, authenticated;
revoke all on function public.extract_note_tags(text) from public, anon, authenticated;
revoke all on function public.extract_note_wiki_titles(text) from public, anon, authenticated;
revoke all on function public.reindex_note_refs(public.notes) from public, anon, authenticated;
revoke all on function public.protect_note_author() from public, anon, authenticated;
revoke all on function public.note_image_is_published(text) from public, anon, authenticated;
revoke all on function public.storage_uuid_segment(text, integer) from public, anon, authenticated;
revoke all on function public.list_notes(uuid) from public, anon, authenticated;
revoke all on function public.list_note_links(uuid) from public, anon, authenticated;
revoke all on function public.list_note_tags(uuid) from public, anon, authenticated;
revoke all on function public.upsert_note(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_note(uuid) from public, anon, authenticated;
revoke all on function public.set_note_published(uuid, boolean) from public, anon, authenticated;
revoke all on function public.rotate_note_publish_token(uuid) from public, anon, authenticated;
revoke all on function public.get_published_note(text) from public, anon, authenticated;
revoke all on function public.create_note_asset(uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.delete_note_asset(uuid) from public, anon, authenticated;

grant execute on function public.extract_note_tags(text) to authenticated;
grant execute on function public.extract_note_wiki_titles(text) to authenticated;
grant execute on function public.list_notes(uuid) to authenticated;
grant execute on function public.list_note_links(uuid) to authenticated;
grant execute on function public.list_note_tags(uuid) to authenticated;
grant execute on function public.upsert_note(uuid, text, text, uuid) to authenticated;
grant execute on function public.delete_note(uuid) to authenticated;
grant execute on function public.set_note_published(uuid, boolean) to authenticated;
grant execute on function public.rotate_note_publish_token(uuid) to authenticated;
grant execute on function public.storage_uuid_segment(text, integer) to anon, authenticated;
grant execute on function public.note_image_is_published(text) to anon, authenticated;
grant execute on function public.get_published_note(text) to anon, authenticated;
grant execute on function public.create_note_asset(uuid, text, integer, integer, integer) to authenticated;
grant execute on function public.delete_note_asset(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists note_images_insert_members on storage.objects;
create policy note_images_insert_members
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'note-images'
  and public.is_space_member(public.storage_uuid_segment(name, 1))
  and exists (
    select 1
    from public.notes n
    where n.id = public.storage_uuid_segment(name, 2)
      and n.space_id = public.storage_uuid_segment(name, 1)
  )
);

drop policy if exists note_images_select_members on storage.objects;
create policy note_images_select_members
on storage.objects
for select to authenticated
using (
  bucket_id = 'note-images'
  and public.is_space_member(public.storage_uuid_segment(name, 1))
);

drop policy if exists note_images_delete_members on storage.objects;
create policy note_images_delete_members
on storage.objects
for delete to authenticated
using (
  bucket_id = 'note-images'
  and public.is_space_member(public.storage_uuid_segment(name, 1))
);

drop policy if exists note_images_select_published on storage.objects;
create policy note_images_select_published
on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'note-images'
  and public.note_image_is_published(name)
);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['notes', 'note_tags', 'note_links', 'note_assets']
    loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      exception
        when duplicate_object then null;
      end;
    end loop;
  end if;
end
$$;
