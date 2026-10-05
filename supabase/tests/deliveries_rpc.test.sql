-- pgTAP: the RPCs the deliver worker uses to claim, complete, retry and drop
-- deliveries.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/users.psql
select plan(21);
select pgmq.purge_queue('spot_events');
select pgmq.purge_queue('deliveries_queue');

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table dw as select * from create_destination('webhook', 'Shack', 'https://shack.example.com/spots');
select save_subscription(jsonb_build_object('name','all','quiet_minutes',0,'destinations',array[(select id from dw)]));
reset role;

select count(*) from ingest_spots(jsonb_build_array(
  jsonb_build_object('source','pota','source_spot_id','s1','content_hash','h1','spot_time',now(),'callsign','KK4PWJ','frequency_khz',14062,'band','20m','mode','cw','comment','','pota_reference','US-2763','pota_location','US-NC','raw_payload','{"secret":1}'::jsonb)));
select is(match_pending_spots(), 1, 'one delivery queued');

-- claim_deliveries returns everything the worker needs in one call.
create temp table claimed as select * from claim_deliveries(200, 60);
select is((select count(*) from claimed), 1::bigint, 'claim returns the queued delivery');
select is((select destination ->> 'url' from claimed), 'https://shack.example.com/spots', 'claim includes the destination url');
select matches((select destination ->> 'signing_secret' from claimed), '^whsec_', 'claim includes the signing secret');
select is((select spot ->> 'callsign' from claimed), 'KK4PWJ', 'claim includes the normalized spot');
select is((select spot ? 'raw_payload' from claimed), false, 'claim does not include raw_payload');
select is((select count(*) from claim_deliveries(200, 60)), 0::bigint, 'a claimed message is invisible until its timeout');

-- Failure: attempts, error, destination counters, message delayed.
select mark_deliveries_failed(array[(select delivery_id from claimed)], array[(select msg_id from claimed)], 'HTTP 500', 300);
select is((select attempts from deliveries), 1, 'failure increments attempts');
select is((select last_error from deliveries), 'HTTP 500', 'failure records the error');
select is((select status from deliveries), 'failed', 'failure marks the delivery failed');
select is((select consecutive_failures from destinations), 1, 'failure increments destination failures');
select is((select health from destinations), 'ok', 'one failure does not mark the destination failing');
select ok((select vt > now() + interval '200 seconds' from pgmq.q_deliveries_queue), 'message is delayed by the backoff');

select mark_deliveries_failed(array[(select delivery_id from claimed)], array[(select msg_id from claimed)], 'HTTP 500', 30) from generate_series(1, 4);
select is((select consecutive_failures from destinations), 5, 'five failures counted');
select is((select health from destinations), 'failing', 'fifth consecutive failure marks the destination failing');

-- Rate-limit delay: message hidden, nothing counted.
select delay_deliveries(array[(select msg_id from claimed)], 120);
select ok((select vt > now() + interval '100 seconds' from pgmq.q_deliveries_queue), 'delay hides the message');
select is((select attempts from deliveries), 5, 'delay does not count an attempt');

-- Success: sent, archived, destination healthy again.
select mark_deliveries_sent(array[(select delivery_id from claimed)], array[(select msg_id from claimed)]);
select is((select status from deliveries), 'sent', 'success marks the delivery sent');
select ok((select sent_at is not null from deliveries), 'success records sent_at');
select is((select queue_length from pgmq.metrics('deliveries_queue')), 0::bigint, 'success archives the message');
select is((select health || ':' || consecutive_failures from destinations), 'ok:0', 'success resets destination health');

select * from finish();
rollback;
