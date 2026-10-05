-- The matching predicate, shared by the matcher and the subscription preview
-- so the UI never re-implements it. Empty filters mean "any". Always returns
-- true or false, never null, so callers can negate it safely.

create or replace function public.spot_matches(sub subscriptions, spot raw_spots)
returns boolean
language sql
immutable
as $$
  select coalesce(
        (cardinality(sub.sources)   = 0 or spot.source   = any (sub.sources))
    and (cardinality(sub.bands)     = 0 or spot.band     = any (sub.bands))
    and (cardinality(sub.modes)     = 0 or spot.mode     = any (sub.modes))
    and (cardinality(sub.callsigns) = 0 or spot.callsign = any (sub.callsigns))
    and (sub.reference = '' or position(lower(sub.reference) in
           lower(concat_ws(',', spot.pota_reference, spot.pota_location, spot.sota_summit_ref))) > 0),
    false);
$$;

-- Live preview for the subscription builder: how many of the last 200 recent
-- spots match a filter, and which. Filter keys match save_subscription.
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
        'frequency_khz', m.frequency_khz, 'band', m.band, 'mode', m.mode, 'comment', m.comment,
        'pota_reference', m.pota_reference, 'pota_park_name', m.pota_park_name,
        'pota_location', m.pota_location, 'sota_summit_ref', m.sota_summit_ref, 'source', m.source
      ) order by m.spot_time desc)
      from matched m
    ), '[]'::jsonb)
  where auth.uid() is not null;
$$;

revoke all on function public.spot_matches(subscriptions, raw_spots) from public;
revoke all on function public.preview_subscription(jsonb) from public;
grant execute on function public.preview_subscription(jsonb) to authenticated;
