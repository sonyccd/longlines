-- pgTAP: frequencies above 10 GHz (3 cm band, QO-100) must be storable.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select lives_ok($$
  select * from ingest_spots(jsonb_build_array(jsonb_build_object(
    'source', 'sotawatch', 'source_spot_id', 'ghz-test', 'content_hash', 'g1', 'spot_time', now() - interval '5 minutes',
    'callsign', 'DL1ABC', 'frequency_khz', 10489700.5, 'band', '3cm_qo100', 'mode', 'ssb', 'comment', '', 'raw_payload', '{}'::jsonb)))
$$, 'a QO-100 spot at 10.49 GHz inserts');
select is((select r.frequency_khz from raw_spots r where r.source = 'sotawatch' and r.source_spot_id = 'ghz-test'), 10489700.500, 'frequency stored exactly');
select is((select v.frequency_khz from recent_spots v join raw_spots r on r.id = v.id where r.source_spot_id = 'ghz-test'), 10489700.500, 'recent_spots shows it');

select * from finish();
rollback;
