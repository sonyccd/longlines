# Long Lines

Long Lines is a routing fabric for amateur radio spots. It watches the public spot feeds for
[Parks on the Air](https://pota.app) and [Summits on the Air](https://sotawatch.sota.org.uk),
normalizes every spot into one shape, and delivers the ones you care about to a Discord channel
or a signed webhook within about a minute of them being posted.

The name is an homage to AT&T's Long Lines microwave backbone. The project moves other people's
signals from where they are published to where they are wanted; it does not generate spots
itself.

The hosted app lives at https://app.longlines.io.

## Why it exists

Spots are how portable operators tell the world "I am on the air, here, now." They are
time-critical: an activation lasts an hour or two, and a park or summit you want to work may
only be spotted once. Each program publishes its own feed, in its own format, with its own
quirks, and the only way to follow them is to keep a browser tab open and refresh.

Long Lines exists so that you can describe what you want once ("CW on 20m and 40m from any
SOTA summit", "this list of callsigns on any band") and have matching spots pushed to you, from
every supported source, in a single format. It also exists as a small, honest example of
running a real-time pipeline entirely on Supabase: Postgres does the scheduling, queuing and
matching, and two kinds of Edge Function do the only parts that need to talk to the outside
world.

## How it works

Everything runs inside one Supabase project plus a static web app.

```
POTA / SOTAwatch ──► ingest functions ──► raw_spots + spot_events queue
                                                   │
                                   match_pending_spots (SQL, every minute)
                                                   │
                                        deliveries + deliveries_queue
                                                   │
                                          deliver function ──► Discord / webhooks
```

**Ingest.** `pg_cron` calls the `ingest-pota` function every minute and `ingest-sotawatch`
every 30 seconds over `pg_net`. Each function fetches its upstream feed, normalizes the spots
(uppercase callsigns, kHz frequencies, lowercase modes, derived `band` and `mode_family`), and
hands the whole batch to one `ingest_spots` RPC. That RPC inserts into `raw_spots` and enqueues
a `spot_events` message per new row in a single transaction. Dedup is a unique constraint over
a content hash, so re-fetching an unchanged feed inserts nothing and an edited spot lands as a
new row. Spots that cannot be normalized go to `ingest_failures` instead of aborting the run.

**Match.** `match_pending_spots()` is a Postgres function on a one-minute cron, also poked after
every successful ingest. It joins a batch of `spot_events` against every enabled subscription
using the `spot_matches` predicate, applies each subscription's per-callsign quiet window, and
writes one `deliveries` row per destination and spot. The web app's live preview calls the same
predicate, so what you see while editing a subscription is exactly what will be delivered.

**Deliver.** The `deliver` function claims queued deliveries, groups them by destination, and
sends them: Discord as embeds, webhooks as signed JSON with an HMAC-SHA256 header. Every outcome
goes back through an RPC so delivery rows, queue messages and destination health change
atomically. Failures back off for 24 hours and then drop; five in a row mark the destination
failing. Rate limits delay rather than fail. Outbound URLs are checked in SQL at creation and
again in the worker, with DNS resolved, so private addresses are never reached.

**Web app.** `web/` is a Vite, React and MUI single-page app that talks to Supabase with the anon
key and the user's session. Users sign in with a callsign or email, see source health, create
destinations (the signing secret is shown once), and build subscriptions with filters on source,
band, mode, callsign and reference. All client writes go through RPCs, and sensitive columns are
excluded from the grants, so nothing in the browser can read a destination URL or secret.

The design rationale is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), day-two checks and
dashboard settings in [docs/OPERATIONS.md](docs/OPERATIONS.md), and the webhook contract with a
verification example in [docs/WEBHOOKS.md](docs/WEBHOOKS.md).

## Repository layout

| Path | What it is |
| --- | --- |
| `supabase/migrations/` | Schema, RPCs, queues, cron jobs. Applied migrations are never edited; add a new one. |
| `supabase/functions/_shared/` | All Edge Function logic: ingest orchestrator, source adapters, mode canonicalization, delivery formatting and sending. |
| `supabase/functions/ingest-*`, `deliver`, `send-test`, `sign-in`, `delete-account` | Thin entrypoints around `_shared`. |
| `supabase/functions/_shared/__tests__/` | Deno unit tests and the fixture JSON captured from the real feeds. Nothing in the suite calls an upstream. |
| `supabase/tests/` | pgTAP suites that assert grants, RLS and RPC behavior against a fresh database. |
| `scripts/` | `smoke-test.sql` (also run by CI) and the one-time `setup-db-settings.sql` for Vault. |
| `web/` | The user-facing app. `src/lib/api.ts` is the only module that touches supabase-js. |
| `docs/` | Architecture, operations, webhook contract, and the UI mock the copy is taken from. |

## Running it locally

Prerequisites: [Docker](https://docs.docker.com/get-docker/), the
[Supabase CLI](https://supabase.com/docs/guides/cli), [Deno](https://deno.com) 2.x, and Node
22 for the web app. On macOS: `brew install supabase/tap/supabase deno node`.

### 1. Start the stack

```sh
supabase start
```

This brings up Postgres, Auth, the API gateway, Studio and a mail catcher, and applies every
migration. The output prints the local URLs and keys. Keep the `anon` and `service_role` keys
handy; you will need both.

| Service | URL |
| --- | --- |
| API | http://127.0.0.1:54321 |
| Studio | http://127.0.0.1:54323 |
| Mail catcher (sign-up confirmations) | http://127.0.0.1:54324 |

`psql` is not installed with the CLI; use the container instead:

```sh
docker exec -i supabase_db_longlines psql -U postgres
```

### 2. Serve the Edge Functions

```sh
supabase functions serve
```

This serves every function under `supabase/functions/` against the local stack with live
reload. The cron jobs exist locally but have no Vault secrets to call the functions with, so
trigger a run by hand:

```sh
curl -X POST http://127.0.0.1:54321/functions/v1/ingest-pota \
  -H "Authorization: Bearer <local service_role key>"
curl -X POST http://127.0.0.1:54321/functions/v1/ingest-sotawatch \
  -H "Authorization: Bearer <local service_role key>"
```

The response is the run summary (`fetched`, `inserted`, `skipped`, `failed`). These calls hit
the real POTA and SOTAwatch APIs, so be polite and do not script them in a loop. Then check what
landed:

```sql
select * from ingest_health;
select source, count(*) from raw_spots group by source;
select * from pgmq.metrics('spot_events');
```

To push spots through matching and delivery, run the matcher and the worker by hand:

```sql
select public.match_pending_spots();
```

```sh
curl -X POST http://127.0.0.1:54321/functions/v1/deliver \
  -H "Authorization: Bearer <local service_role key>"
```

The worker refuses plain-http and private addresses, so a receiver on your own machine is
rejected by default. For local testing only, create `supabase/functions/.env` containing
`LONGLINES_ALLOW_INSECURE_DESTINATIONS=1` and insert the destination row directly in SQL, as
described in [docs/OPERATIONS.md](docs/OPERATIONS.md). Never set that variable on a hosted
project.

### 3. Run the web app

```sh
cd web
cp .env.example .env.local        # SUPABASE_URL is already the local API; paste the local anon key
npm install
npm run dev                       # http://localhost:5173
```

Local Auth requires email confirmation, so after signing up open the mail catcher at
http://127.0.0.1:54324 and click the link. Local `config.toml` already lists
`http://localhost:5173` in the redirect URLs.

### 4. Tests and checks

```sh
deno task test        # unit tests; -P loads net/env/read permissions from deno.json
deno task check       # type-check the Edge Function entrypoints
deno task lint
deno task fmt

supabase test db      # pgTAP suites (local stack must be running)
docker exec -i supabase_db_longlines psql -U postgres -v ON_ERROR_STOP=1 < scripts/smoke-test.sql

cd web && npm test && npm run lint && npm run build
```

CI runs all of the above on every pull request and push to `main`, applying the migrations to
a fresh Postgres first.

### Resetting

`supabase db reset` drops the local database and re-applies every migration. After any schema
change, regenerate the types the web app compiles against:

```sh
supabase gen types typescript --local > web/src/lib/database.types.ts
```

## Deploying to a hosted project

The short version. [docs/OPERATIONS.md](docs/OPERATIONS.md) has the Auth, SMTP and Vercel
settings that go with it.

```sh
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push

supabase secrets set LONGLINES_USER_AGENT_URL=https://github.com/<you>/longlines
for fn in ingest-pota ingest-sotawatch deliver send-test sign-in delete-account; do
  supabase functions deploy "$fn"
done

# One time: give cron the project URL and service-role key via Vault.
# Edit the placeholders in scripts/setup-db-settings.sql first; never commit real values.
psql "$DATABASE_URL" -f scripts/setup-db-settings.sql
```

After a minute or two, `select * from ingest_health;` should show both sources with a recent
`last_success_at`. The web app deploys to Vercel from `web/` as a plain static site.
