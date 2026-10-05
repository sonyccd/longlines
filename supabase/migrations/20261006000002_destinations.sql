-- Destinations: where a user's matched spots are delivered.
--
-- `url` (a Discord webhook URL is a credential) and `signing_secret` are
-- never readable by clients: the column grant below omits them, creation goes
-- through create_destination(), and the secret is returned exactly once.

create extension if not exists pgcrypto with schema extensions;

create table destinations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  type                  text not null check (type in ('discord', 'webhook')),
  name                  text not null,
  url                   text not null,              -- secret
  url_display           text not null,              -- masked, safe to show
  signing_secret        text,                       -- webhooks only; secret
  health                text not null default 'ok' check (health in ('ok', 'failing', 'paused')),
  consecutive_failures  int not null default 0,
  last_success_at       timestamptz,
  last_error            text,
  last_error_at         timestamptz,
  created_at            timestamptz not null default now()
);

create index destinations_user_id_idx on destinations (user_id);

-- ---------------------------------------------------------------------------
-- URL parsing and safety. The delivery worker repeats these checks and also
-- resolves the hostname before connecting.
-- ---------------------------------------------------------------------------

-- Returns [host, port_suffix, path] for an https URL, or null when it is not one.
create or replace function public.parse_https_url(p_url text)
returns text[]
language sql
immutable
as $$
  select case
    when m is null then null
    else array[lower(coalesce(m[1], m[2])), coalesce(m[3], ''), coalesce(m[4], '/')]
  end
  from regexp_match(trim(p_url),
    '^https://(?:\[([0-9A-Fa-f:.]+)\]|([^/:?#\[\]]+))(:[0-9]{1,5})?(/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$') as m;
$$;

-- True for localhost names and IP literals in loopback, private, link-local,
-- CGNAT, unspecified or IPv4-mapped ranges.
create or replace function public.is_private_host(p_host text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_ip inet;
begin
  if p_host = 'localhost' or p_host like '%.localhost' then
    return true;
  end if;
  if p_host ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' or p_host like '%:%' then
    begin
      v_ip := p_host::inet;
    exception when others then
      return true; -- unparseable literal: refuse rather than guess
    end;
    return v_ip <<= any (array[
      '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
      '172.16.0.0/12', '192.168.0.0/16',
      '::/128', '::1/128', '::ffff:0.0.0.0/96', 'fc00::/7', 'fe80::/10'
    ]::inet[]);
  end if;
  return false;
end;
$$;

-- Raises a user-facing message when the URL is not acceptable for the type.
create or replace function public.validate_destination_url(p_type text, p_url text)
returns void
language plpgsql
immutable
as $$
declare
  v_parts text[];
begin
  if p_type not in ('discord', 'webhook') then
    raise exception 'Unknown destination type.';
  end if;
  v_parts := public.parse_https_url(p_url);
  if v_parts is null then
    raise exception 'Use an https URL.';
  end if;
  if p_type = 'discord' then
    if v_parts[1] not in ('discord.com', 'discordapp.com') or v_parts[3] not like '/api/webhooks/%' then
      raise exception 'Use a Discord webhook URL.';
    end if;
  else
    if public.is_private_host(v_parts[1]) then
      raise exception 'That address is not allowed.';
    end if;
  end if;
end;
$$;

-- Masked form shown in the UI. Discord: first 4 chars of the id and 3 of the
-- token. Webhook: scheme, host, port and path without the query string.
create or replace function public.destination_url_display(p_type text, p_url text)
returns text
language sql
immutable
as $$
  with p as (select public.parse_https_url(p_url) as parts),
       d as (select regexp_match(parts[3], '^/api/webhooks/([^/]+)/([^/]*)') as m, parts from p)
  select case
    when p_type = 'discord' then
      'https://' || parts[1] || '/api/webhooks/' || left(coalesce(m[1], ''), 4) || '…/' || left(coalesce(m[2], ''), 3)
    else 'https://' || parts[1] || parts[2] || parts[3]
  end
  from d;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_destination(p_type text, p_name text, p_url text)
returns table (id uuid, type text, name text, url_display text, health text, created_at timestamptz, signing_secret text)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_secret text;
begin
  if v_user is null then
    raise exception 'Not signed in.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Give the destination a name.';
  end if;
  perform public.validate_destination_url(p_type, p_url);
  if p_type = 'webhook' then
    v_secret := 'whsec_' || encode(gen_random_bytes(24), 'hex');
  end if;
  insert into destinations (user_id, type, name, url, url_display, signing_secret)
  values (v_user, p_type, trim(p_name), trim(p_url), public.destination_url_display(p_type, p_url), v_secret)
  returning destinations.id into v_id;
  return query
    select d.id, d.type, d.name, d.url_display, d.health, d.created_at, d.signing_secret
    from destinations d where d.id = v_id;
end;
$$;

create or replace function public.rotate_signing_secret(p_destination_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text := 'whsec_' || encode(gen_random_bytes(24), 'hex');
  v_found boolean;
begin
  update destinations d
  set signing_secret = v_secret
  where d.id = p_destination_id and d.user_id = auth.uid() and d.type = 'webhook'
  returning true into v_found;
  if v_found is null then
    raise exception 'Destination not found.';
  end if;
  return v_secret;
end;
$$;

revoke all on function public.parse_https_url(text) from public;
revoke all on function public.is_private_host(text) from public;
revoke all on function public.validate_destination_url(text, text) from public;
revoke all on function public.destination_url_display(text, text) from public;
revoke all on function public.create_destination(text, text, text) from public;
revoke all on function public.rotate_signing_secret(uuid) from public;
grant execute on function public.create_destination(text, text, text) to authenticated;
grant execute on function public.rotate_signing_secret(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table destinations enable row level security;

revoke all on destinations from anon, authenticated;
grant select (id, user_id, type, name, url_display, health, consecutive_failures,
              last_success_at, last_error, last_error_at, created_at)
  on destinations to authenticated;
grant delete on destinations to authenticated;

create policy destinations_select_own on destinations
  for select to authenticated using (user_id = auth.uid());

create policy destinations_delete_own on destinations
  for delete to authenticated using (user_id = auth.uid());
