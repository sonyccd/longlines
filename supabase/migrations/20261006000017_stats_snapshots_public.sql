-- The Stats page is viewable without signing in, so anonymous clients may read
-- stats_snapshots too. The table holds only aggregated, already-public spot
-- data. Writes and refresh_stats_snapshot() stay cron-only (see
-- 20261006000015_stats_snapshots.sql); the sequence stays revoked.
grant select on stats_snapshots to anon;

drop policy stats_snapshots_select_all on stats_snapshots;
create policy stats_snapshots_select_all on stats_snapshots
  for select to anon, authenticated using (true);
