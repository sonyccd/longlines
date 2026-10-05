-- One row per source observation. A station spotted by both POTA and
-- SOTAwatch produces two rows; cross-source dedup is a downstream concern.
--
-- Dedup within a source is the unique constraint on
-- (source, source_spot_id, content_hash): a re-fetch of an unchanged spot is
-- dropped by ON CONFLICT DO NOTHING, and an upstream edit (new content_hash)
-- lands as a new row.

create table raw_spots (
  id              bigserial primary key,
  source          text        not null check (source in ('pota', 'sotawatch')),
  source_spot_id  text        not null,
  content_hash    text        not null,                  -- sha256 hex
  ingested_at     timestamptz not null default now(),

  -- Normalized common fields
  spot_time       timestamptz not null,                  -- when the spot was reported by upstream
  callsign        text        not null,                  -- activator/spotted station, uppercase, no whitespace
  spotter         text,                                  -- who reported it, uppercase, may be null
  frequency_khz   numeric(10,3) not null,                -- kHz with up to 3 decimals
  band            text,                                  -- derived from frequency; null if outside known bands
  mode            text,                                  -- lowercase, trimmed; may be null
  comment         text        not null default '',       -- trimmed; empty string if upstream had none

  -- Source-specific reference fields (nullable)
  pota_reference  text,                                  -- e.g. "K-0817"
  pota_park_name  text,
  pota_location   text,                                  -- e.g. "US-NC,US-VA" — kept raw
  sota_summit_ref text,                                  -- e.g. "W4C/CM-001"

  -- Provenance
  raw_payload     jsonb       not null,                  -- the upstream record as received

  unique (source, source_spot_id, content_hash)
);

create index raw_spots_spot_time_idx on raw_spots (spot_time desc);
create index raw_spots_callsign_idx on raw_spots (callsign);
create index raw_spots_source_idx on raw_spots (source);
create index raw_spots_band_idx on raw_spots (band) where band is not null;

-- Service-role only. There is no RLS in Phase 1, so the default PostgREST
-- grants must be removed or the anon key could read the table.
revoke all on raw_spots from anon, authenticated;
revoke all on sequence raw_spots_id_seq from anon, authenticated;
