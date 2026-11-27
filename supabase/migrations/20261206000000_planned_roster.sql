-- The original roster: who the admin planned for each shift, next to who does it now. Imports and building
-- the roster set both; taking shifts, swaps and swap offers change only the current assignee. An admin's
-- edit of a single shift changes the original only when asked. The original is the basis for the next
-- roster, so swaps made during one period do not carry over into the next.

alter table public.shifts add column planned_assignee text;

-- Until the admin reconstructs it from the history (in the app), the original is the current roster.
update public.shifts set planned_assignee = assignee;

-- Import: also the original.
create or replace function public.admin_import(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me        public.profiles := public._me();
  r         jsonb;
  v_night   date;
  v_changed integer := 0;
  v_from    date;
  v_to      date;
begin
  perform public._require_admin(me);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'invalid_import';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'import_too_large';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_night := (r ->> 'night')::date;
    if public._assign(v_night, 1::smallint, r ->> 'slot1') then v_changed := v_changed + 1; end if;
    if public._assign(v_night, 2::smallint, r ->> 'slot2') then v_changed := v_changed + 1; end if;
    update public.shifts set planned_assignee = public._clean_name(r ->> 'slot1') where night = v_night and slot = 1;
    update public.shifts set planned_assignee = public._clean_name(r ->> 'slot2') where night = v_night and slot = 2;
    v_from := least(v_from, v_night);
    v_to   := greatest(v_to, v_night);
  end loop;
  perform public._log(me, 'import', null, null,
                      jsonb_build_object('nights', jsonb_array_length(p_rows), 'changed', v_changed,
                                         'from', v_from, 'to', v_to));
  return v_changed;
end;
$$;

-- An admin's edit of one shift: the current assignee, and the original too when p_update_plan.
drop function public.admin_set_assignee(date, smallint, text);
create function public.admin_set_assignee(p_night date, p_slot smallint, p_name text,
                                          p_update_plan boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  me      public.profiles := public._me();
  v_old   text;
  v_name  text := public._clean_name(p_name);
  v_plan  text;
begin
  perform public._require_admin(me);
  select assignee, planned_assignee into v_old, v_plan from public.shifts where night = p_night and slot = p_slot;
  if public._assign(p_night, p_slot, p_name) then
    perform public._log(me, 'admin_set', p_night, p_slot,
                        jsonb_build_object('from', v_old, 'to', v_name, 'plan', p_update_plan));
  end if;
  if p_update_plan and v_plan is distinct from v_name then
    update public.shifts set planned_assignee = v_name where night = p_night and slot = p_slot;
    perform public._log(me, 'admin_set_plan', p_night, p_slot, jsonb_build_object('from', v_plan, 'to', v_name));
  end if;
end;
$$;

-- Sets the original of many shifts at once (the reconstruction from history). Rows: [{night, slot, name}].
create function public.admin_set_plan(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me      public.profiles := public._me();
  r       jsonb;
  v_count integer := 0;
  v_rows  integer;
begin
  perform public._require_admin(me);
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_import';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'import_too_large';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    update public.shifts set planned_assignee = public._clean_name(r ->> 'name')
     where night = (r ->> 'night')::date and slot = (r ->> 'slot')::smallint
       and planned_assignee is distinct from public._clean_name(r ->> 'name');
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  perform public._log(me, 'admin_set_plan', null, null, jsonb_build_object('changed', v_count));
  return v_count;
end;
$$;

-- Renaming a person with their shifts renames them in the original too.
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
    update public.shifts set planned_assignee = v_name
     where public._same_name(planned_assignee, target.display_name);
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

revoke execute on function public.admin_set_assignee(date, smallint, text, boolean), public.admin_set_plan(jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_set_assignee(date, smallint, text, boolean), public.admin_set_plan(jsonb)
  to authenticated;
