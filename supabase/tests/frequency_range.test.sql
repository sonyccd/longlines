-- pgTAP: frequencies above 10 GHz (3 cm band, QO-100) must be storable.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select lives_ok($$
  select * from ingest_spots('[{"source":"sotawatch","source_spot_id":"ghz","content_hash":"g1","spot_time":"2026-10-05T13:37:03Z",
    "callsign":"DL1ABC","frequency_khz":10489700.5,"band":"3cm_qo100","mode":"ssb","comment":"","raw_payload":{}}]'::jsonb)
$$, 'a QO-100 spot at 10.49 GHz inserts');
select is((select frequency_khz from raw_spots where source_spot_id = 'ghz'), 10489700.500, 'frequency stored exactly');
select is((select frequency_khz from recent_spots where callsign = 'DL1ABC'), 10489700.500, 'recent_spots shows it');

select * from finish();
rollback;
