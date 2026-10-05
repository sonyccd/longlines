-- One-time setup: store the values the cron jobs need in Supabase Vault.
--
-- Run ONCE against the hosted project after `supabase db push`, either in the
-- Studio SQL editor or with psql:
--
--   psql "$DATABASE_URL" -f scripts/setup-db-settings.sql
--
-- Replace the two placeholders first. Do NOT commit a copy with real values.
--
-- To rotate a value later:
--   select vault.update_secret(id, '<new value>') from vault.secrets where name = 'longlines_service_role_key';

select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'longlines_supabase_url',
  'Long Lines: project URL used by cron to reach the ingest Edge Functions');

select vault.create_secret('<SERVICE_ROLE_KEY>', 'longlines_service_role_key',
  'Long Lines: service-role key sent as Bearer token by cron');

-- Verify (values are decrypted on read; do not paste the output anywhere):
-- select name, created_at from vault.secrets where name like 'longlines_%';
