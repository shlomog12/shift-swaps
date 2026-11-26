-- An admin deletes a user as if they had never signed in: the Google account is removed from
-- Supabase Auth, which also removes their profile and their swap offers. Signing in again
-- starts over as a new user waiting for approval. Shifts keep the roster name, and history
-- entries stay (without the link to the deleted account).
create function public.admin_delete_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles := public._me();
  target public.profiles;
begin
  perform public._require_admin(me);
  select * into target from public.profiles where id = p_user_id for update;
  if target.id is null then
    raise exception 'user_not_found';
  end if;
  if target.id = me.id then
    raise exception 'cannot_change_self';
  end if;
  if target.is_admin then
    raise exception 'cannot_delete_admin';
  end if;

  delete from public.email_outbox where to_email = target.email and sent_at is null;
  delete from auth.users where id = target.id;

  perform public._log(me, 'delete_user', null, null,
                      jsonb_build_object('user', coalesce(target.display_name, target.google_name, target.email)));
end;
$$;

revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
