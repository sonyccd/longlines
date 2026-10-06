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

psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/smoke-test.sql   # schema smoke test, also run by CI
supabase test db                       # pgTAP suites in supabase/tests/*.test.sql (local db must be running)

cd web && npm run dev:full             # stack + web/.env.local + Vite + functions serve (README lists all npm shortcuts)
cd web && npm run test:all             # every CI check against the local stack, with a summary; :fresh resets the db first
cd web && npm run dev                  # web app on http://localhost:5173 (needs web/.env.local)
cd web && npm test                     # Vitest for web/src/lib
cd web && npm run build                # tsc -b + vite build; zero TS errors required
cd web && npm run lint                 # oxlint
supabase gen types typescript --local > web/src/lib/database.types.ts   # after schema changes

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
  `ingest_spots(jsonb)` is one SQL statement: a data-modifying CTE does the insert with
  `ON CONFLICT DO NOTHING RETURNING`, and a second CTE calls `pgmq.send_batch`. The second CTE
  is cross-joined into the result on purpose; an unreferenced CTE would never run.
- Dedup is the unique constraint `(source, source_spot_id, content_hash)`. The hash field order
  per source is fixed (see `ARCHITECTURE.md`); changing it would make every existing spot look
  new on the next run.
- Cron jobs read the project URL and service-role key from Vault
  (`scripts/setup-db-settings.sql` creates them once). Migrations never contain secrets.

## CI

`.github/workflows/ci.yml` runs on every PR and push to main: Deno fmt/lint/check/test, then
`supabase db start` + `supabase db lint` + `scripts/smoke-test.sql` on a fresh Postgres.
Migrations already applied to the hosted project must not be edited; add a new migration instead
(see `20261005000009_*`).

## Phase 2 schema rules

- Client writes to `destinations` and `subscriptions` go through RPCs (`create_destination`,
  `rotate_signing_secret`, `save_subscription`, `delete_subscription`). Direct insert/update is
  revoked on purpose; the only direct client write is `subscriptions.enabled`.
- `destinations.url` and `signing_secret` are excluded from the column grant. Never add them to a
  view or RPC result except the one-time return from `create_destination`/`rotate_signing_secret`.
- `recent_spots` is the only client view over `raw_spots`; keep `raw_payload` out of it. It and
  `ingest_health` are invoker views with no client grants; clients read them through the definer
  RPCs `list_recent_spots` / `list_ingest_health`. Never make a view `security_invoker = false`
  (the Supabase linter flags it).
- Service-role-only tables (`deliveries`, `subscription_quiet`, `sign_in_attempts`) have RLS on and
  no policies. Functions that touch `auth.users` are `security definer` with execute granted only
  to `service_role`.
- pgTAP tests include `helpers/users.psql` (not `.sql`, so the runner skips it) and use
  `pg_temp.as_user(uuid)` to assert RLS from a user's point of view.

## Phase 3 stats rules

- `stats_snapshots` is written only by `refresh_stats_snapshot()` from pg_cron; clients have
  `select` only. It is the one table `anon` may read: the Stats page (`/stats`) is public and
  renders in `PublicShell` when signed out, `AppShell` when signed in. The payload shape is `StatsPayload` in `web/src/stats/types.ts` and is pinned by
  `supabase/tests/stats_snapshot.test.sql`; change the SQL, the type and the test together.
- The Stats page is deliberately fixed: no controls beyond tooltips, one request per hour of use
  (`web/src/stats/cache.ts` keeps a snapshot until the next refresh is due; never poll).
  Do not add filters, date pickers, sorting or MUI X Pro components.

## Delivery rules

- Matching lives in SQL (`spot_matches`, `match_pending_spots`); never re-implement the predicate in
  TypeScript. The preview RPC and the matcher must stay on the same function.
- The worker (`supabase/functions/deliver`) only talks to the database through the
  `claim_deliveries` / `mark_deliveries_*` / `delay_deliveries` RPCs so delivery rows, queue
  messages and destination health change atomically.
- Formatting, signing and URL safety are pure modules under `_shared/delivery/` with tests;
  `send.ts` is the only place that calls `fetch` for destinations. `allowInsecure` exists for tests
  and local development only.
- Rate limits are not failures: a 429 or the per-run cap delays messages via `delay_deliveries`
  without touching `consecutive_failures`.

## Web app rules

- `web/src/lib/api.ts` is the only module that touches supabase-js; pages call its typed
  functions. Edge Functions are called with plain `fetch` there so non-2xx bodies surface as
  messages.
- Stock MUI theme, `palette.mode` from `prefers-color-scheme` only. MUI 9: `Grid` uses `size`,
  `Stack` takes flex alignment through `sx`, there is no `fontWeight` prop (use a variant such as
  `subtitle2`), `slotProps` replaces `InputProps`/`secondaryTypographyProps`.
- `sx` is for layout only (spacing, sizing, display, flex/grid placement, overflow, position).
  Colors, fonts, borders and shadows come from component props and variants.
- Copy comes from `docs/ui-mock.html`; keep it word for word.
- Matching previews come from the `preview_subscription` RPC, never from TypeScript.
- Database types in `web/src/lib/database.types.ts` are generated; regenerate after migrations.
- Env: `web/vite.config.ts` maps `SUPABASE_URL`/`SUPABASE_ANON_KEY` (what the Supabase Vercel
  integration provides) onto `import.meta.env.VITE_*` with an explicit allowlist. Never widen
  `envPrefix` or add the service-role key to that mapping.
- `web/scripts/*.ts` are local-dev helpers behind the npm scripts, run by Node's built-in type
  stripping (erasable syntax only, `.ts` import extensions). They only talk to the local stack;
  `local-stack.ts` refuses a non-local API URL. Never add a script that deploys or pushes.
- The guided tour lives in `web/src/tour/`. All tour copy is in `model.ts`: the steps, the
  "Take the tour" menu label and the ended toast (the mock has no tour section).
  `TourProvider.tsx` is the only module that imports react-joyride. Pages and dialogs only add
  `data-tour` attributes, call `useTour().report(...)` and read `useTour().active`; never drive
  Joyride from a page.

## Conventions

- Time-dependent functions take `now: Date` so tests pin the clock. Fixtures were captured
  2026-10-05 ~13:45Z; tests set `NOW` inside the five-minute window of the spots they expect to
  keep.
- Mode canonicalization, the comment hint and `mode_family` live in `_shared/modes.ts`. SQL only
  compares strings against `mode` and `mode_family`; never re-derive the family in SQL or the web.
- POTA `spotTime` has no timezone; `parseUtc` appends `Z`. SOTAwatch `type` may be null and is
  treated as NORMAL. The QRT fixture spot has a null frequency, so the type check must stay ahead
  of frequency parsing.
- Tables, the view and the RPCs have `anon`/`authenticated` grants revoked; keep that on any new
  object.
- Be polite to upstreams: User-Agent on every fetch, no polling faster than the cron schedule,
  no tests that hit live APIs.
