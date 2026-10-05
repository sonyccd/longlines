-- Deleting a user must take their subscriptions, destinations and links with
-- it. The restrict FK from subscription_destinations to destinations exists to
-- protect a destination the user is still using, but it also blocks the
-- cascade from auth.users when both are deleted at once. Remove the user's
-- subscriptions (and so the links) before the row goes.

create or replace function public.handle_user_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from subscriptions s where s.user_id = old.id;
  return old;
end;
$$;

create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function public.handle_user_delete();
