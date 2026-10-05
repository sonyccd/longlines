-- Extensions required by the Phase 1 ingest path.
--   pg_cron : schedules the ingest functions
--   pg_net  : lets cron jobs make HTTP calls to the Edge Functions
--   pgmq    : Supabase Queues, backs the spot_events queue

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

create extension if not exists pg_net with schema extensions;

create extension if not exists pgmq;
