-- Users can only pick a name that is already on the roster (a name some shift carries). A name that is
-- not there yet is added by an admin, who can still set any user's name (admin_set_user_name).
-- The stored name takes the roster's own spelling, so "דני  כהן" becomes the roster's "דני כהן".

create or replace function public.claim_name(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles := public._me();
  v_name text := public._clean_name(p_name);
  v_roster text;
begin
  if me.display_name is not null then
    raise exception 'name_already_chosen';
  end if;
  if v_name is null or length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'invalid_name';
  end if;
  select s.assignee into v_roster
    from public.shifts s
   where public._same_name(s.assignee, v_name)
   order by s.night desc
   limit 1;
  if v_roster is null then
    raise exception 'name_not_on_roster';
  end if;
  if exists (select 1 from public.profiles
             where public._same_name(display_name, v_roster) and id <> me.id) then
    raise exception 'name_taken';
  end if;
  update public.profiles set display_name = v_roster where id = me.id;
  perform public._log(me, 'claim_name', null, null, jsonb_build_object('to', v_roster));
end;
$$;
