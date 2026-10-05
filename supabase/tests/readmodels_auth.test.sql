-- pgTAP: client read models (recent_spots, ingest_health), service-role-only
-- tables, and the sign-in helper functions.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/users.psql
select plan(16);

-- A fresh spot and an old one.
insert into raw_spots (source, source_spot_id, content_hash, spot_time, callsign, spotter, frequency_khz, band, mode, comment, pota_reference, raw_payload)
values ('pota', 't1', 'h1', now() - interval '5 minutes', 'KK4PWJ', 'W4ABC', 14062, '20m', 'cw', 'hi', 'US-2763', '{"secret":"yes"}'),
       ('pota', 't2', 'h2', now() - interval '2 days', 'N4DXX', null, 7185, '40m', 'ssb', '', 'US-0817', '{}');

-- Read models for signed-in users.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is((select count(*) from recent_spots), 1::bigint, 'recent_spots shows only the last 24 hours');
select is((select callsign from recent_spots), 'KK4PWJ', 'recent_spots exposes the normalized fields');
select hasnt_column('public', 'recent_spots', 'raw_payload', 'recent_spots has no raw_payload column');
select throws_ok('select raw_payload from raw_spots', '42501', null, 'raw_spots is not readable by clients');
select is((select count(*) from ingest_health), 2::bigint, 'ingest_health is readable by signed-in users');
select throws_ok('select * from ingest_state', '42501', null, 'ingest_state stays hidden');

-- Service-role-only tables.
select throws_ok('select * from deliveries', '42501', null, 'deliveries hidden from clients');
select throws_ok('select * from subscription_quiet', '42501', null, 'subscription_quiet hidden from clients');
select throws_ok('select * from sign_in_attempts', '42501', null, 'sign_in_attempts hidden from clients');
select throws_ok($$ select email_for_identifier('KK4PWJ') $$, '42501', null, 'email lookup not callable by clients');
select throws_ok($$ select record_sign_in_attempt('KK4PWJ') $$, '42501', null, 'attempt recording not callable by clients');

-- Anonymous users see nothing.
set local role anon;
select throws_ok('select * from recent_spots', '42501', null, 'anon cannot read recent_spots');
reset role;

-- Service role helpers (run as the owner here; grants are checked above).
select is(email_for_identifier(' kk4pwj '), 'a@example.com', 'callsign resolves to email, case-insensitive');
select is(email_for_identifier('b@example.com'), 'b@example.com', 'email passes through');
select is(email_for_identifier('N0SUCH'), null, 'unknown callsign gives null');
select is((select record_sign_in_attempt('x') + record_sign_in_attempt('x')), 3, 'attempts accumulate within the window');

select * from finish();
rollback;
