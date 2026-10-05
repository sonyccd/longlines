-- One row per source: the SOTAwatch epoch watermark plus run metrics for
-- observability. Updated only through record_ingest_success/_failure.

create table ingest_state (
  source                  text primary key check (source in ('pota', 'sotawatch')),
  last_run_at             timestamptz,
  last_success_at         timestamptz,
  last_error              text,
  last_error_at           timestamptz,
  last_epoch              text,                          -- SOTAwatch epoch value; null for POTA
  consecutive_failures    int  not null default 0,
  total_spots_ingested    bigint not null default 0,
  total_runs              bigint not null default 0
);

insert into ingest_state (source) values ('pota'), ('sotawatch');

revoke all on ingest_state from anon, authenticated;
