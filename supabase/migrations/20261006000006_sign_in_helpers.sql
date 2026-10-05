-- Helpers for the sign-in Edge Function. Service role only: they touch
-- auth.users and the attempt log, and must never be reachable from a client
-- (resolving a callsign to an email would leak every user's address).

-- Email for a callsign or email identifier; null when unknown.
create or replace function public.email_for_identifier(p_identifier text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when position('@' in p_identifier) > 0 then lower(trim(p_identifier))
    else (
      select u.email::text
      from profiles p
      join auth.users u on u.id = p.id
      where p.callsign = upper(trim(p_identifier))
    )
  end;
$$;

-- Log an attempt and return how many the identifier has made in the last
-- 15 minutes, including this one.
create or replace function public.record_sign_in_attempt(p_identifier text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(p_identifier));
  v_count int;
begin
  insert into sign_in_attempts (identifier) values (v_key);
  select count(*) into v_count
  from sign_in_attempts a
  where a.identifier = v_key and a.attempted_at > now() - interval '15 minutes';
  return v_count;
end;
$$;

revoke all on function public.email_for_identifier(text) from public, anon, authenticated;
revoke all on function public.record_sign_in_attempt(text) from public, anon, authenticated;
grant execute on function public.email_for_identifier(text) to service_role;
grant execute on function public.record_sign_in_attempt(text) to service_role;
