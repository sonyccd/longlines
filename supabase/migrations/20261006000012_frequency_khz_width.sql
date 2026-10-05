-- raw_spots.frequency_khz was numeric(10,3), which tops out just under 10 GHz.
-- The 3 cm band and QO-100 (10,489,550 kHz) overflowed it and failed whole
-- ingest batches with "numeric field overflow". numeric(12,3) allows up to
-- 999,999,999.999 kHz (~1 THz) with the same 1 Hz resolution.

-- recent_spots depends on the column and must be recreated around the change.
drop view recent_spots;

alter table raw_spots alter column frequency_khz type numeric(12,3);

create view recent_spots as
select
  id, spot_time, callsign, spotter, frequency_khz, band, mode, comment,
  pota_reference, pota_park_name, pota_location, sota_summit_ref, source
from raw_spots
where spot_time > now() - interval '24 hours';

revoke all on recent_spots from anon;
grant select on recent_spots to authenticated;

-- ingest_spots declares the column type for jsonb_to_recordset; widen it too.
create or replace function public.ingest_spots(p_spots jsonb)
returns table (id bigint, source text, source_spot_id text)
language sql
security definer
set search_path = public, pgmq
as $$
  with ins as (
    insert into raw_spots (
      source, source_spot_id, content_hash, spot_time, callsign, spotter,
      frequency_khz, band, mode, comment,
      pota_reference, pota_park_name, pota_location, sota_summit_ref,
      raw_payload
    )
    select
      x.source, x.source_spot_id, x.content_hash, x.spot_time, x.callsign, x.spotter,
      x.frequency_khz, x.band, x.mode, coalesce(x.comment, ''),
      x.pota_reference, x.pota_park_name, x.pota_location, x.sota_summit_ref,
      x.raw_payload
    from jsonb_to_recordset(p_spots) as x(
      source text, source_spot_id text, content_hash text, spot_time timestamptz,
      callsign text, spotter text, frequency_khz numeric(12,3), band text, mode text,
      comment text, pota_reference text, pota_park_name text, pota_location text,
      sota_summit_ref text, raw_payload jsonb
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
