# Operations

All queries below run in the Supabase Studio SQL editor (or psql as `postgres`).

## Health check

```sql
select * from ingest_health;
```

Healthy: both rows have a recent `last_success_at`, `consecutive_failures = 0`, and
`spots_last_hour > 0`. SOTAwatch can legitimately insert nothing for a while when the epoch has not
changed; `last_success_at` still advances.

`last_error` is the most recent error ever recorded and is not cleared by a later success. Compare
`last_error_at` with `last_success_at` before worrying about it.

## Why am I not seeing spots?

Work down the chain.

1. Are the cron jobs scheduled and active?
   ```sql
   select jobid, jobname, schedule, active from cron.job;
   select jobname, status, return_message, start_time
   from cron.job_run_details d join cron.job j using (jobid)
   order by start_time desc limit 20;
   ```
2. Did the HTTP calls reach the functions? pg_net keeps recent responses:
   ```sql
   select id, status_code, content::text, created
   from net._http_response order by created desc limit 20;
   ```
   A null `status_code` with an error message usually means the Vault secrets are missing or
   wrong. Check they exist (values are secrets; do not paste them anywhere):
   ```sql
   select name, created_at from vault.secrets where name like 'longlines_%';
   ```
   A 401 means the service-role key in Vault does not match the project.
3. Did the function run but fail? `ingest_state.last_error` holds the message, and the Edge
   Function logs in the dashboard show the same line. Invoke a function by hand to see the
   summary or error directly:
   ```sh
   curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/ingest-pota \
     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
   ```
4. Did the function run and simply skip everything? The response body's `skipped.too_old` counter
   is high when the upstream feed only had old spots (quiet band, or the function was down and is
   catching up). That is normal.

## Dead letter queue

Individual spots that could not be normalized:

```sql
select id, source, occurred_at, error, raw_payload
from ingest_failures order by occurred_at desc limit 20;

-- Which errors are most common?
select source, error, count(*) from ingest_failures
where occurred_at > now() - interval '1 day'
group by 1, 2 order by 3 desc;
```

## Temporarily disable a source

```sql
select cron.alter_job(job_id := jobid, active := false) from cron.job where jobname = 'ingest-pota';
-- later
select cron.alter_job(job_id := jobid, active := true) from cron.job where jobname = 'ingest-pota';
```

`cron.unschedule('ingest-pota')` removes the job entirely; re-running the cron migration
recreates it.

## Replay a failed spot

A failure is usually a normalizer bug or an upstream shape change. After fixing and redeploying
the function, the spot will be picked up again on the next run if it is still in the upstream
feed and under five minutes old. Otherwise, replay by hand with the stored payload: build the
normalized row yourself and call the same RPC the functions use.

```sql
select public.ingest_spots(jsonb_build_array(jsonb_build_object(
  'source', 'pota',
  'source_spot_id', '58161241',
  'content_hash', encode(sha256(convert_to('<spotTime>\n<activator>\n<reference>\n<frequency>\n<mode>\n<comments>', 'utf8')), 'hex'),
  'spot_time', '2026-10-05T13:37:03Z',
  'callsign', 'DL/HB9JNH',
  'spotter', 'OK1HRA',
  'frequency_khz', 10123.9,
  'band', '30m',
  'mode', 'cw',
  'comment', 'RBN 22 dB 19 WPM via OK1HRA-#',
  'pota_reference', 'DE-0858',
  'pota_park_name', 'Via Sancti Martini National Historic Trail',
  'pota_location', 'DE-BW,DE-BY,DE-RP,DE-SL',
  'raw_payload', (select raw_payload from ingest_failures where id = <FAILURE_ID>)
)));

delete from ingest_failures where id = <FAILURE_ID>;
```

The RPC inserts the row and enqueues its `spot_events` message in one transaction, and the unique
constraint still applies, so a replay cannot create a duplicate.

## Queue

```sql
select * from pgmq.metrics('spot_events');
select msg_id, enqueued_at, message from pgmq.q_spot_events order by msg_id desc limit 10;
```

Nothing consumes the queue in Phase 1, so `queue_length` grows with `total_messages`.
