-- Client read models without definer views.
--
-- recent_spots and ingest_health were definer views (0005) so signed-in
-- users could read them without grants on raw_spots or ingest_state. The
-- Supabase security linter flags definer views in an exposed schema, so both
-- become invoker views again, which only the owner and service_role can read
-- (Studio, psql), and clients read them through definer functions instead.
-- What clients see is unchanged: the same columns, the same 24-hour window,
-- and raw_spots and ingest_state stay unreadable.

alter view recent_spots set (security_invoker = true);
alter view ingest_health set (security_invoker = true);

revoke all on recent_spots from anon, authenticated;
revoke all on ingest_health from anon, authenticated;

-- Newest spots first. The limit is applied here rather than by PostgREST:
-- a definer function is never inlined, so a client-side limit would still
-- read the whole 24-hour window.
create function public.list_recent_spots(max_rows int)
returns setof recent_spots
language sql
stable
security definer
set search_path = public
as $$
  select * from recent_spots order by spot_time desc limit max_rows;
$$;

create function public.list_ingest_health()
returns setof ingest_health
language sql
stable
security definer
set search_path = public
as $$
  select * from ingest_health order by source;
$$;

revoke all on function public.list_recent_spots(int) from public, anon, authenticated;
revoke all on function public.list_ingest_health() from public, anon, authenticated;
grant execute on function public.list_recent_spots(int) to authenticated;
grant execute on function public.list_ingest_health() to authenticated;
