-- Replace ingest_spots with a single-statement SQL function. The earlier
-- plpgsql version used a temp table, which the schema linter (plpgsql_check)
-- cannot see; behavior and signature are unchanged.

-- Batch insert normalized spots, enqueue the newly inserted ones, and return
-- those rows. p_spots is a JSON array of objects whose keys match raw_spots
-- columns (see NormalizedSpot in supabase/functions/_shared/types.ts).
--
-- Single statement: the data-modifying CTE runs exactly once, and `sent` is
-- cross-joined into the result so Postgres evaluates it (an unreferenced
-- non-mutating CTE would be skipped). With nothing inserted, send_batch gets
-- an empty array and enqueues nothing.
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
      callsign text, spotter text, frequency_khz numeric(10,3), band text, mode text,
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
