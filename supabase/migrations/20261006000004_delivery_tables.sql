-- Matching state, deliveries, sign-in attempt log, and the deliveries queue.
-- All of these are written by the matcher and the delivery worker only, so
-- they are service-role only: RLS on, no policies, no client grants.

create table subscription_quiet (
  subscription_id  uuid not null references subscriptions(id) on delete cascade,
  callsign         text not null,
  last_sent_at     timestamptz not null,
  primary key (subscription_id, callsign)
);

create table deliveries (
  id               bigserial primary key,
  subscription_id  uuid not null references subscriptions(id) on delete cascade,
  destination_id   uuid not null references destinations(id) on delete cascade,
  spot_id          bigint not null references raw_spots(id),
  status           text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'dropped')),
  attempts         int not null default 0,
  last_error       text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  unique (destination_id, spot_id)   -- two subscriptions sharing a destination deliver a spot once
);

create index deliveries_created_at_idx on deliveries (created_at);
create index deliveries_destination_status_idx on deliveries (destination_id, status);

create table sign_in_attempts (
  id            bigserial primary key,
  identifier    text not null,
  attempted_at  timestamptz not null default now()
);

create index sign_in_attempts_identifier_idx on sign_in_attempts (identifier, attempted_at desc);

select pgmq.create('deliveries_queue');  -- messages: {"delivery_id": <bigint>}

alter table subscription_quiet enable row level security;
alter table deliveries enable row level security;
alter table sign_in_attempts enable row level security;

revoke all on subscription_quiet from anon, authenticated;
revoke all on deliveries from anon, authenticated;
revoke all on sequence deliveries_id_seq from anon, authenticated;
revoke all on sign_in_attempts from anon, authenticated;
revoke all on sequence sign_in_attempts_id_seq from anon, authenticated;
