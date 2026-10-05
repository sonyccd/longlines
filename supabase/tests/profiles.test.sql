-- pgTAP: profiles, sign-up trigger, callsign_available, RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Two users signing up with metadata, as Supabase Auth would insert them.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'a@example.com', 'x', now(), '{"provider":"email","providers":["email"]}', '{"callsign":" kk4pwj ","name":"Brad"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'b@example.com', 'x', now(), '{"provider":"email","providers":["email"]}', '{"callsign":"W1AW"}', now(), now());

select is((select callsign from profiles where id = '11111111-1111-1111-1111-111111111111'), 'KK4PWJ',
  'trigger creates profile with uppercased, trimmed callsign');
select is((select name from profiles where id = '11111111-1111-1111-1111-111111111111'), 'Brad', 'trigger copies name');
select is((select name from profiles where id = '22222222-2222-2222-2222-222222222222'), '', 'missing name defaults to empty');

select throws_ok($$
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'c@example.com', 'x', '{}', '{"callsign":"NOTACALL"}', now(), now())
$$, 'P0001', 'Enter a valid amateur callsign.', 'invalid callsign in metadata rejects the sign-up');

select throws_ok($$
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'd@example.com', 'x', '{}', '{"callsign":"kk4pwj"}', now(), now())
$$, 'P0001', 'That callsign is already taken.', 'duplicate callsign rejects the sign-up');

-- callsign_available is callable anonymously and case-insensitive.
set local role anon;
select is(callsign_available('kk4pwj'), false, 'taken callsign is not available');
select is(callsign_available('N0CALL'), true, 'free callsign is available');
select is(callsign_available('bad!'), false, 'invalid callsign is reported unavailable');
select throws_ok('select * from profiles', '42501', null, 'anon cannot read profiles');
reset role;

-- RLS: user A sees and edits only their own row.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select count(*) from profiles), 1::bigint, 'authenticated user sees exactly their own profile');
update profiles set name = 'Changed' where id = '11111111-1111-1111-1111-111111111111';
select is((select name from profiles where id = '11111111-1111-1111-1111-111111111111'), 'Changed', 'user can update own profile');
update profiles set name = 'Hacked' where id = '22222222-2222-2222-2222-222222222222';
reset role;
select is((select name from profiles where id = '22222222-2222-2222-2222-222222222222'), '', 'user cannot update another profile');
select throws_ok($$ insert into profiles (id, callsign) values ('22222222-2222-2222-2222-222222222222', 'K1ABC') $$,
  '23505', null, 'profiles.id is unique per user');

select * from finish();
rollback;
