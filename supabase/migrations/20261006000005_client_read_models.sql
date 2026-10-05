-- What signed-in users may read about spots and ingest health.

-- Last 24 hours of spots with only the columns the UI shows. raw_payload is
-- deliberately absent. Definer view: raw_spots itself stays unreadable.
create view recent_spots as
select
  id, spot_time, callsign, spotter, frequency_khz, band, mode, comment,
  pota_reference, pota_park_name, pota_location, sota_summit_ref, source
from raw_spots
where spot_time > now() - interval '24 hours';

revoke all on recent_spots from anon;
grant select on recent_spots to authenticated;

-- ingest_health was created as an invoker view for Studio use. Make it a
-- definer view so clients can read it without access to the tables behind it.
alter view ingest_health set (security_invoker = false);
grant select on ingest_health to authenticated;
