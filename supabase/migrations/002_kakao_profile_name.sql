-- Kakao OAuth users store nickname in name/full_name/nickname metadata.
-- Email signup stores display_name. Re-run is safe: CREATE OR REPLACE.

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
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'preferred_username'), ''),
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
