-- Optional short notes: on a swap request ("I can take your Thursday instead"), on volunteering, and on a
-- direct swap offer. The note is shown in the app and added to the e-mail to the shift's owner. A request's
-- note is cleared when the request ends or the shift changes hands.

alter table public.shifts add column swap_note text check (swap_note is null or length(swap_note) <= 300);
alter table public.swap_offers add column note text check (note is null or length(note) <= 300);
alter table public.swap_requests add column note text check (note is null or length(note) <= 300);

-- Collapses whitespace inside lines, keeps line breaks; empty becomes null; longer than 300 is an error.
create function public._clean_note(p_note text) returns text
language plpgsql immutable as $$
declare
  v text := nullif(btrim(regexp_replace(regexp_replace(coalesce(p_note, ''), '[ \t]+', ' ', 'g'), '\s*\n\s*', E'\n', 'g')), '');
begin
  if v is not null and length(v) > 300 then
    raise exception 'note_too_long';
  end if;
  return v;
end;
$$;

-- The e-mail line for a note, or nothing.
create function public._note_line(p_note text) returns text
language sql immutable as $$
  select case when p_note is null then '' else E'\n\nהערה: ' || p_note end;
$$;

-- A request's note lives only as long as the request.
create function public._clear_swap_note() returns trigger
language plpgsql as $$
begin
  if not new.swap_requested or new.assignee is distinct from old.assignee then
    new.swap_note := null;
  end if;
  return new;
end;
$$;

create trigger shifts_clear_swap_note
  before update on public.shifts
  for each row execute function public._clear_swap_note();

-- request_swap, offer_swap and send_swap_request gain an optional note. They are replaced rather than
-- overloaded, so calls without a note keep working and stay unambiguous.

drop function public.request_swap(date, smallint);
create function public.request_swap(p_night date, p_slot smallint, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles := public._me();
  s      public.shifts   := public._lock_shift(p_night, p_slot);
  v_note text            := public._clean_note(p_note);
begin
  perform public._require_owner_or_admin(me, s);
  perform public._require_future(p_night, p_slot);
  if s.assignee is null then
    raise exception 'shift_empty';
  end if;
  if s.swap_requested then
    -- Already open: a new note replaces the old one.
    if p_note is not null then
      update public.shifts set swap_note = v_note, updated_at = now() where night = p_night and slot = p_slot;
    end if;
    return;
  end if;
  update public.shifts set swap_requested = true, swap_note = v_note, updated_at = now()
   where night = p_night and slot = p_slot;
  perform public._log(me, 'request_swap', p_night, p_slot,
                      jsonb_build_object('assignee', s.assignee, 'note', v_note));
end;
$$;

drop function public.offer_swap(date, smallint);
create function public.offer_swap(p_night date, p_slot smallint, p_note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles := public._me();
  s      public.shifts;
  v_id   bigint;
  v_note text := public._clean_note(p_note);
begin
  perform public._require_named(me);
  s := public._lock_shift(p_night, p_slot);
  if not s.swap_requested then
    raise exception 'no_swap_request';
  end if;
  perform public._require_future(p_night, p_slot);
  if public._same_name(s.assignee, me.display_name) then
    raise exception 'already_assignee';
  end if;

  select id into v_id from public.swap_offers
   where night = p_night and slot = p_slot and volunteer_id = me.id and status = 'pending';
  if v_id is not null then
    if p_note is not null then
      update public.swap_offers set note = v_note where id = v_id;
    end if;
    return v_id;
  end if;

  insert into public.swap_offers (night, slot, requester, volunteer_id, volunteer, note)
  values (p_night, p_slot, s.assignee, me.id, me.display_name, v_note)
  returning id into v_id;

  perform public._notify_name(
    s.assignee,
    me.display_name || ' מוכן/ה לקחת את המשמרת שלך: ' || public._shift_label(p_night, p_slot),
    me.display_name || ' התנדב/ה לקחת את המשמרת שלך ב-' || public._shift_label(p_night, p_slot)
      || '. כדי שהחילוף יתבצע צריך לאשר אותו באפליקציה.' || public._note_line(v_note));
  perform public._log(me, 'offer', p_night, p_slot, jsonb_build_object('requester', s.assignee, 'note', v_note));
  return v_id;
end;
$$;

drop function public.send_swap_request(date, smallint, date, smallint);
create function public.send_swap_request(p_night date, p_slot smallint,
                                         p_give_night date default null, p_give_slot smallint default null,
                                         p_note text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles := public._me();
  s      public.shifts;
  g      public.shifts;
  v_id   bigint;
  v_note text := public._clean_note(p_note);
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

  insert into public.swap_requests (night, slot, owner, requester_id, requester, give_night, give_slot, note)
  values (p_night, p_slot, s.assignee, me.id, me.display_name, p_give_night, p_give_slot, v_note)
  returning id into v_id;

  if p_give_night is null then
    perform public._notify_name(
      s.assignee,
      me.display_name || ' מבקש/ת לקחת את המשמרת שלך: ' || public._shift_label(p_night, p_slot),
      me.display_name || ' מבקש/ת לקחת ממך את המשמרת ב-' || public._shift_label(p_night, p_slot)
        || ', בלי משמרת בתמורה. אפשר לאשר או לדחות באפליקציה.' || public._note_line(v_note));
  else
    perform public._notify_name(
      s.assignee,
      me.display_name || ' מבקש/ת להחליף איתך משמרת: ' || public._shift_label(p_night, p_slot),
      me.display_name || ' מציע/ה לקחת את המשמרת שלך ב-' || public._shift_label(p_night, p_slot)
        || ', ובתמורה לתת לך את המשמרת שלו/ה ב-' || public._shift_label(p_give_night, p_give_slot)
        || '. אפשר לאשר או לדחות באפליקציה.' || public._note_line(v_note));
  end if;
  perform public._log(me, 'send_swap_request', p_night, p_slot,
                      jsonb_build_object('owner', s.assignee, 'give_night', p_give_night, 'give_slot', p_give_slot,
                                         'note', v_note));
  return v_id;
end;
$$;

revoke execute on function public._clean_note(text), public._note_line(text), public._clear_swap_note(),
  public.request_swap(date, smallint, text), public.offer_swap(date, smallint, text),
  public.send_swap_request(date, smallint, date, smallint, text)
  from public, anon, authenticated;
grant execute on function
  public.request_swap(date, smallint, text),
  public.offer_swap(date, smallint, text),
  public.send_swap_request(date, smallint, date, smallint, text)
to authenticated;
