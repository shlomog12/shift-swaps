-- Direct swap requests: a user asks the owner of a shift for it, either in exchange for one of
-- their own shifts (give_night/give_slot) or without giving anything back. When the owner
-- accepts, both shifts change hands at once.

create table public.swap_requests (
  id           bigint generated always as identity primary key,
  night        date not null,
  slot         smallint not null,
  owner        text not null,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  requester    text not null,
  give_night   date,
  give_slot    smallint,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  foreign key (night, slot) references public.shifts (night, slot) on delete cascade,
  foreign key (give_night, give_slot) references public.shifts (night, slot) on delete cascade,
  check ((give_night is null) = (give_slot is null))
);

create unique index swap_requests_one_pending_per_requester
  on public.swap_requests (night, slot, requester_id)
  where status = 'pending';

alter table public.swap_requests enable row level security;
create policy swap_requests_read on public.swap_requests for select to authenticated using (public.is_approved());
revoke all on public.swap_requests from anon, authenticated;
grant select on public.swap_requests to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.swap_requests;
  end if;
end;
$$;

------------------------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------------------------

-- Cancels every pending request that asks for this shift or offers it, and tells the requesters.
create function public._cancel_swap_requests(p_night date, p_slot smallint) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.swap_requests;
begin
  for r in
    update public.swap_requests
       set status = 'cancelled', decided_at = now()
     where status = 'pending'
       and ((night = p_night and slot = p_slot) or (give_night = p_night and give_slot = p_slot))
    returning *
  loop
    perform public._notify_id(
      r.requester_id,
      'בקשת החילוף שלך בוטלה: ' || public._shift_label(r.night, r.slot),
      'המשמרת ב-' || public._shift_label(p_night, p_slot)
        || ' השתנתה, ולכן בקשת החילוף שלך מול ' || r.owner || ' כבר לא רלוונטית.');
  end loop;
end;
$$;

-- As before, and also cancels the direct requests on the shift when its assignee changes.
create or replace function public._assign(p_night date, p_slot smallint, p_name text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_name text := public._clean_name(p_name);
  v_old  public.shifts;
begin
  select * into v_old from public.shifts where night = p_night and slot = p_slot for update;
  if v_old.night is null then
    insert into public.shifts (night, slot, assignee) values (p_night, p_slot, v_name);
    return true;
  end if;
  if v_old.assignee is not distinct from v_name then
    return false;
  end if;
  perform public._cancel_pending_offers(p_night, p_slot);
  perform public._cancel_swap_requests(p_night, p_slot);
  update public.shifts
     set assignee = v_name, swap_requested = false, updated_at = now()
   where night = p_night and slot = p_slot;
  return true;
end;
$$;

------------------------------------------------------------------------------------------------
-- User functions
------------------------------------------------------------------------------------------------

create function public.send_swap_request(p_night date, p_slot smallint,
                                         p_give_night date default null, p_give_slot smallint default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  me   public.profiles := public._me();
  s    public.shifts;
  g    public.shifts;
  v_id bigint;
begin
  perform public._require_named(me);
  s := public._lock_shift(p_night, p_slot);
  perform public._require_future(p_night, p_slot);
  if s.assignee is null then
    raise exception 'shift_empty';
  end if;
  if public._same_name(s.assignee, me.display_name) then
    raise exception 'already_assignee';
  end if;
  if (p_give_night is null) <> (p_give_slot is null) then
    raise exception 'shift_not_found';
  end if;
  if p_give_night is not null then
    g := public._lock_shift(p_give_night, p_give_slot);
    perform public._require_future(p_give_night, p_give_slot);
    if not public._same_name(g.assignee, me.display_name) then
      raise exception 'not_your_shift';
    end if;
  end if;
  if exists (select 1 from public.swap_requests
             where night = p_night and slot = p_slot and requester_id = me.id and status = 'pending') then
    raise exception 'request_exists';
  end if;

  insert into public.swap_requests (night, slot, owner, requester_id, requester, give_night, give_slot)
  values (p_night, p_slot, s.assignee, me.id, me.display_name, p_give_night, p_give_slot)
  returning id into v_id;

  if p_give_night is null then
    perform public._notify_name(
      s.assignee,
      me.display_name || ' מבקש/ת לקחת את המשמרת שלך: ' || public._shift_label(p_night, p_slot),
      me.display_name || ' מבקש/ת לקחת ממך את המשמרת ב-' || public._shift_label(p_night, p_slot)
        || ', בלי משמרת בתמורה. אפשר לאשר או לדחות באפליקציה.');
  else
    perform public._notify_name(
      s.assignee,
      me.display_name || ' מבקש/ת להחליף איתך משמרת: ' || public._shift_label(p_night, p_slot),
      me.display_name || ' מציע/ה לקחת את המשמרת שלך ב-' || public._shift_label(p_night, p_slot)
        || ', ובתמורה לתת לך את המשמרת שלו/ה ב-' || public._shift_label(p_give_night, p_give_slot)
        || '. אפשר לאשר או לדחות באפליקציה.');
  end if;
  perform public._log(me, 'send_swap_request', p_night, p_slot,
                      jsonb_build_object('owner', s.assignee, 'give_night', p_give_night, 'give_slot', p_give_slot));
  return v_id;
end;
$$;

create function public.withdraw_swap_request(p_request_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  r  public.swap_requests;
begin
  select * into r from public.swap_requests where id = p_request_id for update;
  if r.id is null or r.requester_id <> me.id then
    raise exception 'request_not_found';
  end if;
  if r.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;
  update public.swap_requests set status = 'cancelled', decided_at = now() where id = r.id;
  perform public._log(me, 'withdraw_swap_request', r.night, r.slot, jsonb_build_object('owner', r.owner));
end;
$$;

create function public.decline_swap_request(p_request_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  r  public.swap_requests;
  s  public.shifts;
begin
  select * into r from public.swap_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'request_not_found';
  end if;
  if r.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;
  s := public._lock_shift(r.night, r.slot);
  perform public._require_owner_or_admin(me, s);
  update public.swap_requests set status = 'declined', decided_at = now() where id = r.id;
  perform public._notify_id(
    r.requester_id,
    'בקשת החילוף לא אושרה: ' || public._shift_label(r.night, r.slot),
    coalesce(s.assignee, r.owner) || ' לא אישר/ה את בקשת החילוף שלך על המשמרת ב-'
      || public._shift_label(r.night, r.slot) || '.');
  perform public._log(me, 'decline_swap_request', r.night, r.slot, jsonb_build_object('requester', r.requester));
end;
$$;

create function public.accept_swap_request(p_request_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me          public.profiles := public._me();
  r           public.swap_requests;
  s           public.shifts;
  g           public.shifts;
  v_requester text;
begin
  select * into r from public.swap_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'request_not_found';
  end if;
  if r.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;
  s := public._lock_shift(r.night, r.slot);
  perform public._require_owner_or_admin(me, s);
  perform public._require_future(r.night, r.slot);
  if not public._same_name(s.assignee, r.owner) then
    raise exception 'stale_request';
  end if;
  select display_name into v_requester from public.profiles where id = r.requester_id;
  if v_requester is null or not public._same_name(v_requester, r.requester) then
    raise exception 'stale_request';
  end if;
  if r.give_night is not null then
    g := public._lock_shift(r.give_night, r.give_slot);
    perform public._require_future(r.give_night, r.give_slot);
    if not public._same_name(g.assignee, v_requester) then
      raise exception 'stale_request';
    end if;
  end if;

  -- Mark it accepted first, so the clean-up in _assign does not cancel it.
  update public.swap_requests set status = 'accepted', decided_at = now() where id = r.id;
  perform public._assign(r.night, r.slot, v_requester);
  if r.give_night is not null then
    perform public._assign(r.give_night, r.give_slot, s.assignee);
  end if;

  perform public._notify_id(
    r.requester_id,
    'בקשת החילוף אושרה – המשמרת שלך: ' || public._shift_label(r.night, r.slot),
    s.assignee || ' אישר/ה את בקשת החילוף. המשמרת ב-' || public._shift_label(r.night, r.slot)
      || ' רשומה עכשיו עליך'
      || case when r.give_night is null then '.'
              else ', והמשמרת שלך ב-' || public._shift_label(r.give_night, r.give_slot)
                   || ' עברה ל-' || s.assignee || '.' end);
  perform public._log(me, 'accept_swap_request', r.night, r.slot,
                      jsonb_build_object('from', s.assignee, 'to', v_requester,
                                         'give_night', r.give_night, 'give_slot', r.give_slot));
end;
$$;

revoke execute on function
  public._cancel_swap_requests(date, smallint),
  public._assign(date, smallint, text),
  public.send_swap_request(date, smallint, date, smallint),
  public.withdraw_swap_request(bigint),
  public.decline_swap_request(bigint),
  public.accept_swap_request(bigint)
from public, anon, authenticated;

grant execute on function
  public.send_swap_request(date, smallint, date, smallint),
  public.withdraw_swap_request(bigint),
  public.decline_swap_request(bigint),
  public.accept_swap_request(bigint)
to authenticated;
