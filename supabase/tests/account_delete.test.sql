-- pgTAP: deleting an auth user removes everything they own, even with a
-- subscription still linked to a destination (the restrict FK must not block
-- the cascade).
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/users.psql
select plan(4);

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table d as select * from create_destination('discord', 'A discord', 'https://discord.com/api/webhooks/1/a');
select save_subscription(jsonb_build_object('name', 'all', 'destinations', array[(select id from d)]));
reset role;

select lives_ok($$ delete from auth.users where id = '11111111-1111-1111-1111-111111111111' $$, 'user with a linked subscription can be deleted');
select is((select count(*) from profiles where id = '11111111-1111-1111-1111-111111111111'), 0::bigint, 'profile removed');
select is((select count(*) from subscriptions where user_id = '11111111-1111-1111-1111-111111111111'), 0::bigint, 'subscriptions removed');
select is((select count(*) from destinations where user_id = '11111111-1111-1111-1111-111111111111'), 0::bigint, 'destinations removed');

select * from finish();
rollback;
