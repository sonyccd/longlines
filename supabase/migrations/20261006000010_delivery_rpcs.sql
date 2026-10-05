-- RPCs for the deliver worker. Service role only.

-- Read up to p_limit queued deliveries (invisible to other workers for p_vt
-- seconds) with the spot and destination joined in. Messages whose delivery
-- row no longer exists are archived here so they cannot loop forever.
create or replace function public.claim_deliveries(p_limit int default 200, p_vt int default 60)
returns table (
  msg_id bigint, delivery_id bigint, subscription_id uuid, attempts int, created_at timestamptz,
  destination jsonb, spot jsonb
)
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_msgs    jsonb;
  v_orphans bigint[];
begin
  select jsonb_agg(jsonb_build_object('msg_id', m.msg_id, 'delivery_id', (m.message ->> 'delivery_id')::bigint))
    into v_msgs
  from pgmq.read('deliveries_queue', p_vt, p_limit) m;

  if v_msgs is null then
    return;
  end if;

  select array_agg((x ->> 'msg_id')::bigint) into v_orphans
  from jsonb_array_elements(v_msgs) x
  where not exists (select 1 from deliveries d where d.id = (x ->> 'delivery_id')::bigint);
  if v_orphans is not null then
    perform pgmq.archive('deliveries_queue', v_orphans);
  end if;

  return query
    select
      (x ->> 'msg_id')::bigint,
      d.id, d.subscription_id, d.attempts, d.created_at,
      jsonb_build_object(
        'id', dest.id, 'type', dest.type, 'name', dest.name, 'url', dest.url,
        'signing_secret', dest.signing_secret, 'health', dest.health,
        'consecutive_failures', dest.consecutive_failures
      ),
      jsonb_build_object(
        'id', r.id, 'source', r.source, 'spot_time', r.spot_time, 'callsign', r.callsign,
        'spotter', r.spotter, 'frequency_khz', r.frequency_khz, 'band', r.band, 'mode', r.mode,
        'comment', r.comment, 'pota_reference', r.pota_reference, 'pota_park_name', r.pota_park_name,
        'pota_location', r.pota_location, 'sota_summit_ref', r.sota_summit_ref
      )
    from jsonb_array_elements(v_msgs) x
    join deliveries d on d.id = (x ->> 'delivery_id')::bigint
    join destinations dest on dest.id = d.destination_id
    join raw_spots r on r.id = d.spot_id
    order by d.id;
end;
$$;

-- Delivered: mark sent, archive the messages, and restore destination health
-- (a paused destination stays paused).
create or replace function public.mark_deliveries_sent(p_delivery_ids bigint[], p_msg_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  update deliveries d set status = 'sent', sent_at = now() where d.id = any (p_delivery_ids);
  update destinations dest
  set consecutive_failures = 0,
      last_success_at = now(),
      health = case when dest.health = 'paused' then 'paused' else 'ok' end
  where dest.id in (select d.destination_id from deliveries d where d.id = any (p_delivery_ids));
  perform pgmq.archive('deliveries_queue', p_msg_ids);
end;
$$;

-- Attempt failed: count it on the deliveries and once on each destination
-- (five in a row marks it failing), and hide the messages for the backoff.
create or replace function public.mark_deliveries_failed(
  p_delivery_ids bigint[], p_msg_ids bigint[], p_error text, p_delay_seconds int
)
returns void
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  update deliveries d
  set status = 'failed', attempts = d.attempts + 1, last_error = p_error
  where d.id = any (p_delivery_ids);

  update destinations dest
  set consecutive_failures = dest.consecutive_failures + 1,
      last_error = p_error,
      last_error_at = now(),
      health = case
        when dest.health = 'paused' then 'paused'
        when dest.consecutive_failures + 1 >= 5 then 'failing'
        else dest.health
      end
  where dest.id in (select d.destination_id from deliveries d where d.id = any (p_delivery_ids));

  perform pgmq.set_vt('deliveries_queue', m, p_delay_seconds) from unnest(p_msg_ids) as m;
end;
$$;

-- Too old to retry: mark dropped and archive.
create or replace function public.mark_deliveries_dropped(p_delivery_ids bigint[], p_msg_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  update deliveries d set status = 'dropped' where d.id = any (p_delivery_ids);
  perform pgmq.archive('deliveries_queue', p_msg_ids);
end;
$$;

revoke all on function public.claim_deliveries(int, int) from public, anon, authenticated;
revoke all on function public.mark_deliveries_sent(bigint[], bigint[]) from public, anon, authenticated;
revoke all on function public.mark_deliveries_failed(bigint[], bigint[], text, int) from public, anon, authenticated;
revoke all on function public.mark_deliveries_dropped(bigint[], bigint[]) from public, anon, authenticated;
grant execute on function public.claim_deliveries(int, int) to service_role;
grant execute on function public.mark_deliveries_sent(bigint[], bigint[]) to service_role;
grant execute on function public.mark_deliveries_failed(bigint[], bigint[], text, int) to service_role;
grant execute on function public.mark_deliveries_dropped(bigint[], bigint[]) to service_role;

-- Rate limited upstream: hide the messages for a while without counting a
-- failure against the deliveries or the destination.
create or replace function public.delay_deliveries(p_msg_ids bigint[], p_delay_seconds int)
returns void
language sql
security definer
set search_path = public, pgmq
as $$
  select pgmq.set_vt('deliveries_queue', m, p_delay_seconds) from unnest(p_msg_ids) as m;
$$;

revoke all on function public.delay_deliveries(bigint[], int) from public, anon, authenticated;
grant execute on function public.delay_deliveries(bigint[], int) to service_role;
