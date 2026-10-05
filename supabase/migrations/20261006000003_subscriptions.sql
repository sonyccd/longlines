-- Subscriptions: which spots a user wants, and where to send them.
-- Writes go through save_subscription()/delete_subscription() so a
-- subscription and its destination links change atomically.

create table subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  enabled        boolean not null default true,
  sources        text[] not null default '{}',   -- empty = any
  bands          text[] not null default '{}',   -- empty = any
  modes          text[] not null default '{}',   -- empty = any, lowercase
  callsigns      text[] not null default '{}',   -- empty = any, uppercase, exact match
  reference      text not null default '',       -- empty = any; case-insensitive contains
  quiet_minutes  int not null default 10 check (quiet_minutes in (0, 5, 10, 30, 60)),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index subscriptions_user_id_idx on subscriptions (user_id);

-- `on delete restrict` is what stops a destination that is still in use from
-- being deleted; the UI shows "Remove it from its subscriptions first".
create table subscription_destinations (
  subscription_id  uuid not null references subscriptions(id) on delete cascade,
  destination_id   uuid not null references destinations(id) on delete restrict,
  primary key (subscription_id, destination_id)
);

create index subscription_destinations_destination_idx on subscription_destinations (destination_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function public.set_updated_at();

-- Insert (no "id") or update (with "id") a subscription and replace its
-- destination links. Payload keys: id?, name, enabled?, sources?, bands?,
-- modes?, callsigns?, reference?, quiet_minutes?, destinations (uuid[]).
create or replace function public.save_subscription(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_id    uuid := (payload ->> 'id')::uuid;
  v_name  text := trim(coalesce(payload ->> 'name', ''));
  v_dests uuid[];
  v_owned int;
begin
  if v_user is null then
    raise exception 'Not signed in.';
  end if;
  if v_name = '' then
    raise exception 'Give the subscription a name.';
  end if;

  select coalesce(array_agg(distinct x::uuid), '{}') into v_dests
  from jsonb_array_elements_text(coalesce(payload -> 'destinations', '[]'::jsonb)) as x;
  if cardinality(v_dests) = 0 then
    raise exception 'Pick at least one destination.';
  end if;
  select count(*) into v_owned from destinations d where d.id = any (v_dests) and d.user_id = v_user;
  if v_owned <> cardinality(v_dests) then
    raise exception 'Destination not found.';
  end if;

  if v_id is null then
    insert into subscriptions (user_id, name, enabled, sources, bands, modes, callsigns, reference, quiet_minutes)
    values (
      v_user, v_name,
      coalesce((payload ->> 'enabled')::boolean, true),
      public.jsonb_text_array(payload -> 'sources', 'lower'),
      public.jsonb_text_array(payload -> 'bands', 'none'),
      public.jsonb_text_array(payload -> 'modes', 'lower'),
      public.jsonb_text_array(payload -> 'callsigns', 'upper'),
      trim(coalesce(payload ->> 'reference', '')),
      coalesce((payload ->> 'quiet_minutes')::int, 10)
    )
    returning id into v_id;
  else
    update subscriptions s
    set name          = v_name,
        enabled       = coalesce((payload ->> 'enabled')::boolean, s.enabled),
        sources       = public.jsonb_text_array(payload -> 'sources', 'lower'),
        bands         = public.jsonb_text_array(payload -> 'bands', 'none'),
        modes         = public.jsonb_text_array(payload -> 'modes', 'lower'),
        callsigns     = public.jsonb_text_array(payload -> 'callsigns', 'upper'),
        reference     = trim(coalesce(payload ->> 'reference', '')),
        quiet_minutes = coalesce((payload ->> 'quiet_minutes')::int, s.quiet_minutes)
    where s.id = v_id and s.user_id = v_user;
    if not found then
      raise exception 'Subscription not found.';
    end if;
    delete from subscription_destinations sd where sd.subscription_id = v_id;
  end if;

  insert into subscription_destinations (subscription_id, destination_id)
  select v_id, d from unnest(v_dests) as d;

  return v_id;
end;
$$;

-- Trimmed, de-duplicated text array from a JSON array, with optional casing.
create or replace function public.jsonb_text_array(p_values jsonb, p_case text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct v order by v), '{}')
  from (
    select case p_case when 'lower' then lower(trim(x)) when 'upper' then upper(trim(x)) else trim(x) end as v
    from jsonb_array_elements_text(coalesce(p_values, '[]'::jsonb)) as x
  ) t
  where v <> '';
$$;

create or replace function public.delete_subscription(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from subscriptions s where s.id = p_id and s.user_id = auth.uid();
  if not found then
    raise exception 'Subscription not found.';
  end if;
end;
$$;

revoke all on function public.jsonb_text_array(jsonb, text) from public;
revoke all on function public.save_subscription(jsonb) from public;
revoke all on function public.delete_subscription(uuid) from public;
grant execute on function public.save_subscription(jsonb) to authenticated;
grant execute on function public.delete_subscription(uuid) to authenticated;

-- Access: read own rows; the enabled switch is the only direct write.
alter table subscriptions enable row level security;
alter table subscription_destinations enable row level security;

revoke all on subscriptions from anon, authenticated;
revoke all on subscription_destinations from anon, authenticated;
grant select, update (enabled) on subscriptions to authenticated;
grant select on subscription_destinations to authenticated;

create policy subscriptions_select_own on subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy subscriptions_update_own on subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy subscription_destinations_select_own on subscription_destinations
  for select to authenticated
  using (exists (select 1 from subscriptions s where s.id = subscription_id and s.user_id = auth.uid()));
