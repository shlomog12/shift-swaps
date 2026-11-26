-- An admin can unlink a user from their roster name by setting it to null (an empty name).
-- The user then picks a name again, and the old name is free for someone else. Their pending
-- offers are cancelled, as they can no longer be accepted without a name. Shifts keep the name.
create or replace function public.admin_set_user_name(p_user_id uuid, p_name text, p_rename_shifts boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles := public._me();
  target public.profiles;
  v_name text := public._clean_name(p_name);
begin
  perform public._require_admin(me);
  select * into target from public.profiles where id = p_user_id for update;
  if target.id is null then
    raise exception 'user_not_found';
  end if;
  if v_name is not null and (length(v_name) < 2 or length(v_name) > 60) then
    raise exception 'invalid_name';
  end if;
  if v_name is not null and exists (select 1 from public.profiles
                                    where public._same_name(display_name, v_name) and id <> p_user_id) then
    raise exception 'name_taken';
  end if;
  update public.profiles set display_name = v_name where id = p_user_id;
  if v_name is null then
    update public.swap_offers set status = 'cancelled', decided_at = now()
     where volunteer_id = p_user_id and status = 'pending';
  elsif p_rename_shifts and target.display_name is not null then
    update public.shifts set assignee = v_name, updated_at = now()
     where public._same_name(assignee, target.display_name);
    update public.swap_offers set requester = v_name
     where status = 'pending' and public._same_name(requester, target.display_name);
    update public.swap_offers set volunteer = v_name
     where status = 'pending' and volunteer_id = p_user_id;
  end if;
  if v_name is null then
    perform public._log(me, 'admin_clear_user_name', null, null,
                        jsonb_build_object('from', target.display_name,
                                           'user', coalesce(target.google_name, target.email)));
  else
    perform public._log(me, 'admin_rename_user', null, null,
                        jsonb_build_object('from', target.display_name, 'to', v_name,
                                           'shifts_renamed', p_rename_shifts));
  end if;
end;
$$;
