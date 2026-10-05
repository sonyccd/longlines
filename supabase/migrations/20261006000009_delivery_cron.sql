-- Cron: matcher safety net, delivery worker, daily housekeeping.

select cron.schedule('match-pending-spots', '* * * * *', $$ select public.match_pending_spots(); $$);

select cron.schedule(
  'deliver',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'longlines_supabase_url')
             || '/functions/v1/deliver',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'longlines_service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $$
);

-- Deliveries and archived queue messages older than 7 days, sign-in attempts
-- older than a day.
create or replace function public.run_housekeeping()
returns void
language sql
security definer
set search_path = public, pgmq
as $$
  delete from deliveries where created_at < now() - interval '7 days';
  delete from pgmq.a_spot_events where archived_at < now() - interval '7 days';
  delete from pgmq.a_deliveries_queue where archived_at < now() - interval '7 days';
  delete from sign_in_attempts where attempted_at < now() - interval '1 day';
$$;

revoke all on function public.run_housekeeping() from public, anon, authenticated;

select cron.schedule('housekeeping', '0 3 * * *', $$ select public.run_housekeeping(); $$);
