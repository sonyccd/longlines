-- Mode families. Ingest derives raw_spots.mode_family from the mode in
-- supabase/functions/_shared/modes.ts, which is the only source of truth for
-- what a mode string means. SQL only compares strings and never re-derives it.
--
-- Why: SOTAwatch's spot form offers a single DATA label for every digital
-- mode, so a subscription filtered to "ft8" can never see a SOTA digital
-- activation. A filter value now matches either the mode or its family, so
-- "digital" catches ft8, ft4, data, rtty, psk and friends from both sources.
--
-- No backfill: matching only runs on newly ingested rows and recent_spots
-- only shows the last 24 hours.

alter table raw_spots
  add column mode_family text check (mode_family in ('cw', 'phone', 'digital'));

comment on column raw_spots.mode_family is
  'cw | phone | digital | null, derived at ingest by _shared/modes.ts';

-- ingest_spots: same as 0013 plus the new column.
create or replace function public.ingest_spots(p_spots jsonb)
returns table (id bigint, source text, source_spot_id text)
language sql
security definer
set search_path = public, pgmq
as $$
  with ins as (
    insert into raw_spots (
      source, source_spot_id, content_hash, spot_time, callsign, spotter,
      frequency_khz, band, mode, mode_family, comment,
      pota_reference, pota_park_name, pota_location, sota_summit_ref,
      raw_payload
    )
    select
      x.source, x.source_spot_id, x.content_hash, x.spot_time, x.callsign, x.spotter,
      x.frequency_khz, x.band, x.mode, x.mode_family, coalesce(x.comment, ''),
      x.pota_reference, x.pota_park_name, x.pota_location, x.sota_summit_ref,
      x.raw_payload
    from jsonb_to_recordset(p_spots) as x(
      source text, source_spot_id text, content_hash text, spot_time timestamptz,
      callsign text, spotter text, frequency_khz numeric, band text, mode text,
      mode_family text, comment text, pota_reference text, pota_park_name text,
      pota_location text, sota_summit_ref text, raw_payload jsonb
    )
    on conflict (source, source_spot_id, content_hash) do nothing
    returning raw_spots.id, raw_spots.source, raw_spots.source_spot_id
  ),
  sent as (
    select count(*) as message_count
    from pgmq.send_batch(
      'spot_events',
      coalesce(
        (select array_agg(jsonb_build_object('spot_id', ins.id, 'source', ins.source)) from ins),
        '{}'::jsonb[]
      )
    )
  )
  select ins.id, ins.source, ins.source_spot_id
  from ins cross join sent
  order by ins.id;
$$;

-- recent_spots: mode_family sits next to mode. "create or replace view" can
-- only append columns, so recreate it. A new view picks up the default
-- privileges, which grant everything to anon and authenticated, and a simple
-- definer view is auto-updatable, so revoke from both before granting read
-- access. (0005 only revoked from anon, which left clients able to write
-- raw_spots through the view.)
drop view recent_spots;
create view recent_spots as
select
  id, spot_time, callsign, spotter, frequency_khz, band, mode, mode_family, comment,
  pota_reference, pota_park_name, pota_location, sota_summit_ref, source
from raw_spots
where spot_time > now() - interval '24 hours';

revoke all on recent_spots from anon, authenticated;
grant select on recent_spots to authenticated;

-- spot_matches: a mode filter value matches the mode or its family.
create or replace function public.spot_matches(sub subscriptions, spot raw_spots)
returns boolean
language sql
immutable
as $$
  select coalesce(
        (cardinality(sub.sources)   = 0 or spot.source   = any (sub.sources))
    and (cardinality(sub.bands)     = 0 or spot.band     = any (sub.bands))
    and (cardinality(sub.modes)     = 0 or spot.mode     = any (sub.modes)
                                        or spot.mode_family = any (sub.modes))
    and (cardinality(sub.callsigns) = 0 or spot.callsign = any (sub.callsigns))
    and (sub.reference = '' or position(lower(sub.reference) in
           lower(concat_ws(',', spot.pota_reference, spot.pota_location, spot.sota_summit_ref))) > 0),
    false);
$$;

-- preview_subscription: same as 0007 plus mode_family in the spot JSON.
create or replace function public.preview_subscription(filter jsonb)
returns table (count bigint, spots jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with sub as (
    select (
      gen_random_uuid(), auth.uid(), '', true,
      public.jsonb_text_array(filter -> 'sources', 'lower'),
      public.jsonb_text_array(filter -> 'bands', 'none'),
      public.jsonb_text_array(filter -> 'modes', 'lower'),
      public.jsonb_text_array(filter -> 'callsigns', 'upper'),
      trim(coalesce(filter ->> 'reference', '')),
      0, now(), now()
    )::subscriptions as s
  ),
  recent as (
    select r.* from raw_spots r
    where r.spot_time > now() - interval '24 hours'
    order by r.spot_time desc
    limit 200
  ),
  matched as (
    select r.* from recent r, sub where public.spot_matches(sub.s, r)
  )
  select
    (select count(*) from matched),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'spot_time', m.spot_time, 'callsign', m.callsign, 'spotter', m.spotter,
        'frequency_khz', m.frequency_khz, 'band', m.band, 'mode', m.mode, 'mode_family', m.mode_family,
        'comment', m.comment,
        'pota_reference', m.pota_reference, 'pota_park_name', m.pota_park_name,
        'pota_location', m.pota_location, 'sota_summit_ref', m.sota_summit_ref, 'source', m.source
      ) order by m.spot_time desc)
      from matched m
    ), '[]'::jsonb)
  where auth.uid() is not null;
$$;

-- claim_deliveries: same as 0010 plus mode_family in the spot JSON.
create or replace function public.claim_deliveries(p_limit int default 200, p_vt int default 60)
returns table (
  msg_id bigint, delivery_id bigint, subscription_id uuid, attempts int, created_at timestamptz,
  destination jsonb, spot jsonb
)
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_msgs    jsonb;
  v_orphans bigint[];
begin
  select jsonb_agg(jsonb_build_object('msg_id', m.msg_id, 'delivery_id', (m.message ->> 'delivery_id')::bigint))
    into v_msgs
  from pgmq.read('deliveries_queue', p_vt, p_limit) m;

  if v_msgs is null then
    return;
  end if;

  select array_agg((x ->> 'msg_id')::bigint) into v_orphans
  from jsonb_array_elements(v_msgs) x
  where not exists (select 1 from deliveries d where d.id = (x ->> 'delivery_id')::bigint);
  if v_orphans is not null then
    perform pgmq.archive('deliveries_queue', v_orphans);
  end if;

  return query
    select
      (x ->> 'msg_id')::bigint,
      d.id, d.subscription_id, d.attempts, d.created_at,
      jsonb_build_object(
        'id', dest.id, 'type', dest.type, 'name', dest.name, 'url', dest.url,
        'signing_secret', dest.signing_secret, 'health', dest.health,
        'consecutive_failures', dest.consecutive_failures
      ),
      jsonb_build_object(
        'id', r.id, 'source', r.source, 'spot_time', r.spot_time, 'callsign', r.callsign,
        'spotter', r.spotter, 'frequency_khz', r.frequency_khz, 'band', r.band, 'mode', r.mode,
        'mode_family', r.mode_family,
        'comment', r.comment, 'pota_reference', r.pota_reference, 'pota_park_name', r.pota_park_name,
        'pota_location', r.pota_location, 'sota_summit_ref', r.sota_summit_ref
      )
    from jsonb_array_elements(v_msgs) x
    join deliveries d on d.id = (x ->> 'delivery_id')::bigint
    join destinations dest on dest.id = d.destination_id
    join raw_spots r on r.id = d.spot_id
    order by d.id;
end;
$$;
