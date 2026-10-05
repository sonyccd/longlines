# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Long Lines ingests ham radio spots from POTA and SOTAwatch into Supabase. Phase 1 (current) is
ingest-to-storage only; the scope exclusions in `docs/ARCHITECTURE.md` and the original spec are
deliberate. Do not add auth, RLS, UI, consumers, notifications, cross-source dedup, or new sources
without being asked.

Everything runs on Supabase: Postgres (pg_cron, pg_net, pgmq) plus two Deno Edge Functions in
strict TypeScript. No JavaScript files, no `any` without a justifying comment, no new runtime
dependencies without a comment saying why.

## Commands

```sh
deno task test        # unit tests; -P loads the permission set from deno.json (net/env/read for http + fixture tests)
deno test -P supabase/functions/_shared/__tests__/pota.test.ts --filter "hashes"   # one test
deno task check       # type-check both Edge Function entrypoints
deno task lint
deno task fmt

supabase start                # local stack, applies all migrations
supabase db reset             # re-apply migrations from scratch locally
supabase functions serve      # serve both functions against the local stack
docker exec -i supabase_db_longlines psql -U postgres   # psql is not installed; use the container

supabase db push                       # hosted: apply migrations
supabase functions deploy ingest-pota  # hosted: deploy one function
```

Local invocation: `curl -X POST http://127.0.0.1:54321/functions/v1/ingest-pota -H "Authorization: Bearer <service_role key printed by supabase start>"`.

## Architecture

- `supabase/functions/_shared/ingest.ts` is the orchestrator; `ingest-pota/index.ts` and
  `ingest-sotawatch/index.ts` are three-line shells around `serve.ts`. Behavior changes go in
  `_shared`, never in the entrypoints.
- Source adapters (`pota.ts`, `sotawatch.ts`) implement `SourceAdapter` from `types.ts`:
  `parseFeed` and `normalize` are pure and tested against fixtures; only `fetchSpots`/`fetchEpoch`
  do I/O. `normalize` returns `{kind: "skip"}` for intentional drops and throws for unprocessable
  spots; the orchestrator turns throws into `ingest_failures` rows without aborting the run.
- `IngestDb` (`types.ts`) is the only database surface the orchestrator sees. `db.ts` implements
  it over supabase-js; tests use an in-memory fake.
- All writes go through security-definer RPCs in `supabase/migrations/*_ingest_functions.sql`.
  `ingest_spots(jsonb)` does the batch insert with `ON CONFLICT DO NOTHING RETURNING` and
  `pgmq.send_batch` in one transaction. It is plpgsql with `#variable_conflict use_column`
  because the output columns share names with `raw_spots` columns.
- Dedup is the unique constraint `(source, source_spot_id, content_hash)`. The hash field order
  per source is fixed (see `ARCHITECTURE.md`); changing it would make every existing spot look
  new on the next run.
- Cron jobs read the project URL and service-role key from Vault
  (`scripts/setup-db-settings.sql` creates them once). Migrations never contain secrets.

## Conventions

- Time-dependent functions take `now: Date` so tests pin the clock. Fixtures were captured
  2026-10-05 ~13:45Z; tests set `NOW` inside the five-minute window of the spots they expect to
  keep.
- POTA `spotTime` has no timezone; `parseUtc` appends `Z`. SOTAwatch `type` may be null and is
  treated as NORMAL. The QRT fixture spot has a null frequency, so the type check must stay ahead
  of frequency parsing.
- Tables, the view and the RPCs have `anon`/`authenticated` grants revoked; keep that on any new
  object.
- Be polite to upstreams: User-Agent on every fetch, no polling faster than the cron schedule,
  no tests that hit live APIs.
