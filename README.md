# Long Lines

Long Lines is a ham radio spot routing platform. It ingests amateur radio "spots" (reports of
stations being heard on the air) from upstream sources and will route them to user-defined
destinations such as webhooks, Discord, or a pull API. The name is an homage to AT&T's Long
Lines microwave backbone: the project exists to be the routing fabric between sources and
destinations, not to generate data itself.

## Phase 1 scope

Phase 1 is the ingest-to-storage foundation only. No auth, no users, no notifications, no API
beyond what Supabase auto-generates. The goal is to prove that the ingest path works end-to-end
on pure Supabase with two real upstream sources producing real normalized spots in a queryable
table.

In: POTA and SOTAwatch ingest via two Edge Functions on pg_cron, a `raw_spots` table, a
`spot_events` queue primed for later consumers, and the `ingest_health` view.

Out: everything else. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and
[docs/OPERATIONS.md](docs/OPERATIONS.md) for day-to-day checks.

## Quickstart

Prerequisites: a hosted Supabase project, the [Supabase CLI](https://supabase.com/docs/guides/cli),
and [Deno](https://deno.com) 2.x. On macOS: `brew install supabase/tap/supabase deno`. The
[Deno VS Code extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno)
is recommended; `.vscode/settings.json` already enables it for `supabase/functions`.

```sh
# 1. Link the repo to your hosted project
supabase login
supabase link --project-ref <PROJECT_REF>

# 2. Apply the schema, queue, RPCs and cron jobs
supabase db push

# 3. Deploy the two ingest functions
supabase secrets set LONGLINES_USER_AGENT_URL=https://github.com/<you>/longlines
supabase functions deploy ingest-pota
supabase functions deploy ingest-sotawatch

# 4. Tell cron where the functions live (one time, never committed with real values)
#    Edit scripts/setup-db-settings.sql, then run it in the Studio SQL editor or with psql:
psql "$DATABASE_URL" -f scripts/setup-db-settings.sql
```

Verify, after a minute or two, in the Studio SQL editor:

```sql
select * from ingest_health;
select source, count(*) from raw_spots group by source;
select * from pgmq.metrics('spot_events');
```

Both sources should show `last_success_at` populated and `spots_last_hour > 0`.

## Web app

The user-facing app lives in `web/` (Vite, React, MUI, React Router). It talks to Supabase
with the anon key and the user's session; everything sensitive stays behind RLS and RPCs.

```sh
cd web
cp .env.example .env.local        # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev                       # http://localhost:5173
npm test && npm run build         # Vitest, then tsc + vite build into web/dist
```

Production runs on Vercel at https://app.longlines.io; see docs/OPERATIONS.md for the deploy
settings and the Supabase Auth URLs that must match.

## Development

```sh
deno task test     # unit tests (deno test -P ...; -P loads the permission set from deno.json)
deno task check    # type-check both functions
deno task lint
deno task fmt

supabase start               # local stack; applies supabase/migrations
supabase functions serve     # serve both functions locally against that stack
curl -X POST http://127.0.0.1:54321/functions/v1/ingest-pota \
  -H "Authorization: Bearer <local service_role key from supabase start>"
```

Tests run against fixture JSON captured from the real APIs in
`supabase/functions/_shared/__tests__/fixtures/`; nothing in the test suite calls an upstream.
The only test-time dependency is `jsr:@std/assert` (Deno's standard library).
