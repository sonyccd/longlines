-- At-a-glance health per source: `select * from ingest_health;`

create or replace view ingest_health
with (security_invoker = true)
as
select
  s.source,
  s.last_run_at,
  s.last_success_at,
  extract(epoch from (now() - s.last_success_at))::int as seconds_since_last_success,
  s.consecutive_failures,
  s.last_error,
  (select count(*) from raw_spots r where r.source = s.source and r.ingested_at > now() - interval '1 hour') as spots_last_hour,
  (select count(*) from raw_spots r where r.source = s.source and r.ingested_at > now() - interval '24 hours') as spots_last_24h,
  s.total_spots_ingested
from ingest_state s;

revoke all on ingest_health from anon, authenticated;
