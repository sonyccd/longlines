-- The matcher. Reads a batch of spot_events, finds matching enabled
-- subscriptions, applies each subscription's quiet window, creates one
-- delivery per (destination, spot), queues them, and archives the events.
-- One transaction: a failure anywhere leaves the events unread.
--
-- Called by the ingest functions after each run and by cron as a safety net.

create or replace function public.match_pending_spots(batch_size int default 500)
returns int
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_msg_ids      bigint[];
  v_spot_ids     bigint[];
  v_delivery_ids bigint[];
  v_url          text;
  v_key          text;
begin
  select array_agg(m.msg_id), array_agg((m.message ->> 'spot_id')::bigint)
    into v_msg_ids, v_spot_ids
  from pgmq.read('spot_events', 60, batch_size) m;

  if v_msg_ids is null then
    return 0;
  end if;

  with candidates as (
    select s.id as subscription_id, s.quiet_minutes, r.id as spot_id, r.callsign, r.spot_time
    from raw_spots r
    join subscriptions s on s.enabled and public.spot_matches(s, r)
    where r.id = any (v_spot_ids)
  ),
  -- With a quiet window, only the earliest spot per callsign in this batch is eligible.
  eligible as (
    (
      select distinct on (c.subscription_id, c.callsign) c.*
      from candidates c
      where c.quiet_minutes > 0
      order by c.subscription_id, c.callsign, c.spot_time, c.spot_id
    )
    union all
    select c.* from candidates c where c.quiet_minutes = 0
  ),
  allowed as (
    select e.*
    from eligible e
    left join subscription_quiet q
      on q.subscription_id = e.subscription_id and q.callsign = e.callsign
    where e.quiet_minutes = 0
       or q.last_sent_at is null
       or q.last_sent_at <= now() - make_interval(mins => e.quiet_minutes)
  ),
  stamp_quiet as (
    insert into subscription_quiet (subscription_id, callsign, last_sent_at)
    select distinct a.subscription_id, a.callsign, now()
    from allowed a
    where a.quiet_minutes > 0
    on conflict (subscription_id, callsign) do update set last_sent_at = excluded.last_sent_at
  ),
  ins as (
    insert into deliveries (subscription_id, destination_id, spot_id)
    select distinct on (sd.destination_id, a.spot_id) a.subscription_id, sd.destination_id, a.spot_id
    from allowed a
    join subscription_destinations sd on sd.subscription_id = a.subscription_id
    order by sd.destination_id, a.spot_id, a.subscription_id
    on conflict (destination_id, spot_id) do nothing
    returning id
  )
  select array_agg(ins.id) into v_delivery_ids from ins;

  if v_delivery_ids is not null then
    perform pgmq.send_batch(
      'deliveries_queue',
      (select array_agg(jsonb_build_object('delivery_id', d)) from unnest(v_delivery_ids) as d)
    );
  end if;

  perform pgmq.archive('spot_events', v_msg_ids);

  -- Kick the delivery worker so matches go out within seconds. Skipped when
  -- the Vault secrets are absent (local development, tests); cron covers it.
  if v_delivery_ids is not null then
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'longlines_supabase_url';
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'longlines_service_role_key';
    if v_url is not null and v_key is not null then
      perform net.http_post(
        url := v_url || '/functions/v1/deliver',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    end if;
  end if;

  return coalesce(cardinality(v_delivery_ids), 0);
end;
$$;

revoke all on function public.match_pending_spots(int) from public, anon, authenticated;
grant execute on function public.match_pending_spots(int) to service_role;
