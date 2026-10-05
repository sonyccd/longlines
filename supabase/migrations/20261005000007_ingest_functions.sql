-- RPCs called by the Edge Functions through supabase-js.
--
-- They exist because (a) the pgmq schema is not exposed through PostgREST, so
-- enqueueing has to go through a function in `public`, and (b) inserting the
-- spots and enqueueing their ids in one transaction means a spot can never be
-- stored without its queue message.
--
-- All three are security definer and callable only by service_role/postgres.

-- Batch insert normalized spots, enqueue the newly inserted ones, and return
-- those rows. p_spots is a JSON array of objects whose keys match raw_spots
-- columns (see NormalizedSpot in supabase/functions/_shared/types.ts).
create or replace function public.ingest_spots(p_spots jsonb)
returns table (id bigint, source text, source_spot_id text)
language plpgsql
security definer
set search_path = public, pgmq
as $$
-- The output columns (id, source, source_spot_id) are plpgsql variables and
-- would otherwise shadow the raw_spots columns in the ON CONFLICT clause.
#variable_conflict use_column
declare
  v_messages jsonb[];
begin
  -- Temp table survives for the transaction so repeated calls in one
  -- transaction reuse it (and must start empty).
  if to_regclass('pg_temp._ingested') is null then
    create temp table _ingested (id bigint, source text, source_spot_id text) on commit drop;
  end if;
  truncate _ingested;

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
  )
  insert into _ingested select ins.id, ins.source, ins.source_spot_id from ins;

  select array_agg(jsonb_build_object('spot_id', i.id, 'source', i.source))
    into v_messages
  from _ingested i;

  if v_messages is not null then
    perform pgmq.send_batch('spot_events', v_messages);
  end if;

  return query select i.id, i.source, i.source_spot_id from _ingested i order by i.id;
end;
$$;

-- Record a successful run. p_epoch is only supplied by SOTAwatch.
create or replace function public.record_ingest_success(
  p_source text,
  p_inserted integer,
  p_epoch text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update ingest_state
  set last_run_at          = now(),
      last_success_at      = now(),
      consecutive_failures = 0,
      total_runs           = total_runs + 1,
      total_spots_ingested = total_spots_ingested + p_inserted,
      last_epoch           = coalesce(p_epoch, last_epoch)
  where source = p_source;
$$;

-- Record a function-level failure (upstream unreachable, bad payload shape).
create or replace function public.record_ingest_failure(p_source text, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update ingest_state
  set last_run_at          = now(),
      last_error           = p_error,
      last_error_at        = now(),
      consecutive_failures = consecutive_failures + 1,
      total_runs           = total_runs + 1
  where source = p_source;
$$;

revoke all on function public.ingest_spots(jsonb) from public, anon, authenticated;
revoke all on function public.record_ingest_success(text, integer, text) from public, anon, authenticated;
revoke all on function public.record_ingest_failure(text, text) from public, anon, authenticated;
grant execute on function public.ingest_spots(jsonb) to service_role;
grant execute on function public.record_ingest_success(text, integer, text) to service_role;
grant execute on function public.record_ingest_failure(text, text) to service_role;
