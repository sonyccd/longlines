-- Cron jobs that invoke the ingest Edge Functions over HTTP via pg_net.
--
-- The project URL and service-role key are read from Supabase Vault. They are
-- created once, outside of migrations, by scripts/setup-db-settings.sql. Until
-- those two secrets exist the jobs run but the http_post fails; nothing else
-- breaks.
--
-- Schedules: pg_cron on Supabase accepts "[1-59] seconds" as a schedule, so
-- SOTAwatch runs every 30 seconds as a single job.

select cron.schedule(
  'ingest-pota',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'longlines_supabase_url')
             || '/functions/v1/ingest-pota',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'longlines_service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);

select cron.schedule(
  'ingest-sotawatch',
  '30 seconds',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'longlines_supabase_url')
             || '/functions/v1/ingest-sotawatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'longlines_service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
