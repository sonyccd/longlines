-- Dead letter for individual spots that could not be normalized during an
-- otherwise successful run. Function-level failures (upstream unreachable,
-- bad response shape) go to ingest_state.last_error instead.

create table ingest_failures (
  id           bigserial primary key,
  source       text not null,
  occurred_at  timestamptz not null default now(),
  error        text not null,
  raw_payload  jsonb not null
);

create index ingest_failures_occurred_at_idx on ingest_failures (occurred_at desc);

revoke all on ingest_failures from anon, authenticated;
revoke all on sequence ingest_failures_id_seq from anon, authenticated;
