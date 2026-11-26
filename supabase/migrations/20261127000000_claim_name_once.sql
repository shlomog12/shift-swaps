-- A user picks their roster name once. Later changes go through an admin (admin_set_user_name).
create or replace function public.claim_name(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles := public._me();
  v_name text := public._clean_name(p_name);
begin
  if me.display_name is not null then
    raise exception 'name_already_chosen';
  end if;
  if v_name is null or length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'invalid_name';
  end if;
  if exists (select 1 from public.profiles
             where public._same_name(display_name, v_name) and id <> me.id) then
    raise exception 'name_taken';
  end if;
  update public.profiles set display_name = v_name where id = me.id;
  perform public._log(me, 'claim_name', null, null, jsonb_build_object('to', v_name));
end;
$$;
