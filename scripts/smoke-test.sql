-- Smoke test for the applied schema. Run by CI against a fresh local Postgres
-- after the migrations; safe to run locally too (it rolls itself back).
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/smoke-test.sql

begin;

do $$
declare
  n int;
  first_pass int;
  second_pass int;
  spots_before int := (select count(*) from raw_spots);
  queue_before int := (select count(*) from pgmq.q_spot_events);
begin
  -- Cron jobs are scheduled.
  select count(*) into n from cron.job where jobname in ('ingest-pota', 'ingest-sotawatch');
  assert n = 2, format('expected 2 cron jobs, found %s', n);
  assert exists (select 1 from cron.job where jobname = 'ingest-sotawatch' and schedule = '30 seconds'),
    'ingest-sotawatch should run every 30 seconds';

  -- ingest_state is seeded.
  select count(*) into n from ingest_state;
  assert n = 2, format('expected 2 ingest_state rows, found %s', n);

  -- ingest_spots inserts, dedups and enqueues.
  select count(*) into first_pass from public.ingest_spots('[
    {"source":"pota","source_spot_id":"smoke-1","content_hash":"a","spot_time":"2026-10-05T13:37:03Z","callsign":"W1AW","spotter":null,"frequency_khz":14074,"band":"20m","mode":"ft8","comment":"","raw_payload":{}},
    {"source":"sotawatch","source_spot_id":"smoke-2","content_hash":"b","spot_time":"2026-10-05T13:37:03Z","callsign":"SQ1GPR/P","spotter":"SQ1GPR","frequency_khz":7097,"band":"40m","mode":"ssb","comment":"","sota_summit_ref":"SP/SS-004","raw_payload":{}}
  ]'::jsonb);
  assert first_pass = 2, format('expected 2 inserted rows, got %s', first_pass);

  select count(*) into second_pass from public.ingest_spots('[
    {"source":"pota","source_spot_id":"smoke-1","content_hash":"a","spot_time":"2026-10-05T13:37:03Z","callsign":"W1AW","frequency_khz":14074,"comment":"","raw_payload":{}},
    {"source":"pota","source_spot_id":"smoke-1","content_hash":"a2","spot_time":"2026-10-05T13:37:03Z","callsign":"W1AW","frequency_khz":14074,"comment":"edited","raw_payload":{}}
  ]'::jsonb);
  assert second_pass = 1, format('expected 1 inserted row on re-run with one edit, got %s', second_pass);

  select count(*) - spots_before into n from raw_spots;
  assert n = 3, format('expected 3 new raw_spots rows, found %s', n);

  select count(*) - queue_before into n from pgmq.q_spot_events;
  assert n = 3, format('expected 3 new queued messages, found %s', n);

  -- State RPCs.
  perform public.record_ingest_success('sotawatch', 1, 'epoch-1');
  perform public.record_ingest_failure('pota', 'boom');
  assert (select last_epoch from ingest_state where source = 'sotawatch') = 'epoch-1';
  assert (select consecutive_failures from ingest_state where source = 'pota') = 1;

  -- Health view reads.
  select count(*) into n from ingest_health;
  assert n = 2, 'ingest_health should have one row per source';
end $$;

-- anon must not be able to read the tables.
do $$
begin
  set local role anon;
  begin
    perform count(*) from raw_spots;
    raise exception 'anon could read raw_spots';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
end $$;

rollback;
\echo smoke test passed
