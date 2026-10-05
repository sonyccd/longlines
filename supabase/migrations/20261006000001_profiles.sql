-- One profile per auth user, created by a trigger from the sign-up metadata
-- (options.data = {callsign, name}). Callsigns are unique and uppercase.

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  callsign    text not null unique check (callsign ~ '^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,4}[A-Z](/[A-Z0-9]+)?$'),
  name        text not null default '',
  timezone    text not null default 'UTC',
  utc_times   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Normalize the callsign on every write so the check constraint sees clean input.
create or replace function public.normalize_profile_callsign()
returns trigger
language plpgsql
as $$
begin
  new.callsign := upper(trim(new.callsign));
  return new;
end;
$$;

create trigger profiles_normalize_callsign
  before insert or update of callsign on profiles
  for each row execute function public.normalize_profile_callsign();

-- Create the profile when Supabase Auth inserts the user. Raising here makes
-- sign-up fail, which is what we want for a bad or taken callsign; the client
-- checks callsign_available() first so this is a backstop.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_callsign text := upper(trim(new.raw_user_meta_data ->> 'callsign'));
begin
  if v_callsign is null or v_callsign !~ '^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,4}[A-Z](/[A-Z0-9]+)?$' then
    raise exception 'Enter a valid amateur callsign.';
  end if;
  if exists (select 1 from profiles p where p.callsign = v_callsign) then
    raise exception 'That callsign is already taken.';
  end if;
  insert into profiles (id, callsign, name)
  values (new.id, v_callsign, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sign-up precheck. Callable anonymously; reveals only whether a callsign is free.
create or replace function public.callsign_available(p_callsign text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select upper(trim(p_callsign)) ~ '^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,4}[A-Z](/[A-Z0-9]+)?$'
     and not exists (select 1 from profiles p where p.callsign = upper(trim(p_callsign)));
$$;

revoke all on function public.callsign_available(text) from public;
grant execute on function public.callsign_available(text) to anon, authenticated;

-- Access: users read and edit only their own row. No client inserts or deletes
-- (the trigger inserts; auth.users cascade deletes).
alter table profiles enable row level security;

revoke all on profiles from anon, authenticated;
grant select, update (callsign, name, timezone, utc_times) on profiles to authenticated;

create policy profiles_select_own on profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_update_own on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
