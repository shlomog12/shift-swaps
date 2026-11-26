-- Shift Swaps schema.
-- The browser only reads tables; every write goes through the security-definer functions below,
-- which enforce the rules and record the audit log.

------------------------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null default '',
  display_name text check (display_name is null or length(display_name) between 2 and 60),
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

create unique index profiles_display_name_key
  on public.profiles (lower(display_name))
  where display_name is not null;

create table public.shifts (
  night          date not null,
  slot           smallint not null check (slot in (1, 2)),
  assignee       text check (assignee is null or length(assignee) between 1 and 60),
  swap_requested boolean not null default false,
  updated_at     timestamptz not null default now(),
  primary key (night, slot),
  check (not swap_requested or assignee is not null)
);

create table public.swap_offers (
  id           bigint generated always as identity primary key,
  night        date not null,
  slot         smallint not null,
  requester    text not null,
  volunteer_id uuid not null references public.profiles (id) on delete cascade,
  volunteer    text not null,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  foreign key (night, slot) references public.shifts (night, slot) on delete cascade
);

create unique index swap_offers_one_pending_per_volunteer
  on public.swap_offers (night, slot, volunteer_id)
  where status = 'pending';

create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text,
  actor_email text,
  action      text not null,
  night       date,
  slot        smallint,
  details     jsonb not null default '{}'
);

create index audit_log_at_idx on public.audit_log (at desc);

create table public.email_outbox (
  id         bigint generated always as identity primary key,
  to_email   text not null,
  subject    text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  error      text
);

------------------------------------------------------------------------------------------------
-- Row level security and privileges
------------------------------------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.shifts       enable row level security;
alter table public.swap_offers  enable row level security;
alter table public.audit_log    enable row level security;
alter table public.email_outbox enable row level security;

create policy profiles_read    on public.profiles    for select to authenticated using (true);
create policy shifts_read      on public.shifts      for select to authenticated using (true);
create policy swap_offers_read on public.swap_offers for select to authenticated using (true);
create policy audit_log_read   on public.audit_log   for select to authenticated using (true);
-- email_outbox has no policy: only the service role (edge function) can touch it.

revoke all on public.profiles, public.shifts, public.swap_offers, public.audit_log, public.email_outbox
  from anon, authenticated;

-- E-mail addresses are not readable by other users; admins get them through admin_list_users().
grant select (id, display_name, is_admin, created_at) on public.profiles to authenticated;
grant select on public.shifts, public.swap_offers to authenticated;
grant select (id, at, actor_id, actor_name, action, night, slot, details) on public.audit_log to authenticated;

------------------------------------------------------------------------------------------------
-- Profile creation on sign-up
------------------------------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------------------------
-- Internal helpers
------------------------------------------------------------------------------------------------

create function public._me() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then
    raise exception 'not_signed_in';
  end if;
  return p;
end;
$$;

create function public._require_named(p public.profiles) returns void
language plpgsql immutable as $$
begin
  if p.display_name is null then
    raise exception 'choose_name_first';
  end if;
end;
$$;

create function public._require_admin(p public.profiles) returns void
language plpgsql immutable as $$
begin
  if not p.is_admin then
    raise exception 'admin_only';
  end if;
end;
$$;

-- Collapses whitespace; empty input becomes null.
create function public._clean_name(p_name text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
$$;

create function public._same_name(a text, b text) returns boolean
language sql immutable as $$
  select a is not null and b is not null and lower(a) = lower(b);
$$;

create function public.shift_start(p_night date, p_slot smallint) returns timestamptz
language sql stable as $$
  select (p_night + case when p_slot = 1 then time '00:00' else time '03:00' end)
         at time zone 'Asia/Jerusalem';
$$;

create function public._require_future(p_night date, p_slot smallint) returns void
language plpgsql stable as $$
begin
  if public.shift_start(p_night, p_slot) <= now() then
    raise exception 'shift_in_past';
  end if;
end;
$$;

create function public._shift_label(p_night date, p_slot smallint) returns text
language sql immutable as $$
  select to_char(p_night, 'FMDD.FMMM.YYYY') || ' '
         || case when p_slot = 1 then '00:00-03:00' else '03:00-06:00' end;
$$;

create function public._log(p public.profiles, p_action text, p_night date, p_slot smallint,
                            p_details jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, actor_name, actor_email, action, night, slot, details)
  values (p.id, p.display_name, p.email, p_action, p_night, p_slot, coalesce(p_details, '{}'));
$$;

-- Queues an e-mail to the user who owns the given roster name, if they have signed in.
create function public._notify_name(p_name text, p_subject text, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into public.email_outbox (to_email, subject, body)
  select email, p_subject, p_body
  from public.profiles
  where public._same_name(display_name, p_name) and email <> '';
$$;

create function public._notify_id(p_id uuid, p_subject text, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into public.email_outbox (to_email, subject, body)
  select email, p_subject, p_body
  from public.profiles
  where id = p_id and email <> '';
$$;

-- Cancels every pending offer on a shift and tells the volunteers.
create function public._cancel_pending_offers(p_night date, p_slot smallint) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.swap_offers;
begin
  for o in
    update public.swap_offers
       set status = 'cancelled', decided_at = now()
     where night = p_night and slot = p_slot and status = 'pending'
    returning *
  loop
    perform public._notify_id(
      o.volunteer_id,
      'בקשת החילוף בוטלה: ' || public._shift_label(p_night, p_slot),
      'בקשת החילוף של ' || o.requester || ' במשמרת ' || public._shift_label(p_night, p_slot)
        || ' בוטלה, ולכן ההתנדבות שלך כבר לא רלוונטית.');
  end loop;
end;
$$;

-- Sets the assignee of a shift (creating the shift if needed). Clears a swap request and cancels its
-- offers when the assignee changes. Returns true if anything changed.
create function public._assign(p_night date, p_slot smallint, p_name text) returns boolean
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
  update public.shifts
     set assignee = v_name, swap_requested = false, updated_at = now()
   where night = p_night and slot = p_slot;
  return true;
end;
$$;

------------------------------------------------------------------------------------------------
-- User functions
------------------------------------------------------------------------------------------------

-- Names that appear on the roster, with whether a user already claimed them.
create function public.roster_names()
returns table (name text, claimed boolean)
language sql stable security definer set search_path = public as $$
  with names as (
    select distinct assignee as name from public.shifts where assignee is not null
    union
    select display_name from public.profiles where display_name is not null
  )
  select n.name,
         exists (select 1 from public.profiles p where public._same_name(p.display_name, n.name))
  from names n
  order by n.name;
$$;

create function public.claim_name(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles := public._me();
  v_name text := public._clean_name(p_name);
begin
  if v_name is null or length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'invalid_name';
  end if;
  if exists (select 1 from public.profiles
             where public._same_name(display_name, v_name) and id <> me.id) then
    raise exception 'name_taken';
  end if;
  update public.profiles set display_name = v_name where id = me.id;
  perform public._log(me, 'claim_name', null, null,
                      jsonb_build_object('from', me.display_name, 'to', v_name));
end;
$$;

create function public.take_shift(p_night date, p_slot smallint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
begin
  perform public._require_named(me);
  perform public._require_future(p_night, p_slot);
  update public.shifts
     set assignee = me.display_name, updated_at = now()
   where night = p_night and slot = p_slot and assignee is null;
  if not found then
    if exists (select 1 from public.shifts where night = p_night and slot = p_slot) then
      raise exception 'shift_taken';
    end if;
    raise exception 'shift_not_found';
  end if;
  perform public._log(me, 'take', p_night, p_slot, '{}');
end;
$$;

create function public._lock_shift(p_night date, p_slot smallint) returns public.shifts
language plpgsql security definer set search_path = public as $$
declare
  s public.shifts;
begin
  select * into s from public.shifts where night = p_night and slot = p_slot for update;
  if s.night is null then
    raise exception 'shift_not_found';
  end if;
  return s;
end;
$$;

create function public._require_owner_or_admin(me public.profiles, s public.shifts) returns void
language plpgsql immutable as $$
begin
  if not me.is_admin and not public._same_name(s.assignee, me.display_name) then
    raise exception 'not_your_shift';
  end if;
end;
$$;

create function public.request_swap(p_night date, p_slot smallint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  s  public.shifts   := public._lock_shift(p_night, p_slot);
begin
  perform public._require_owner_or_admin(me, s);
  perform public._require_future(p_night, p_slot);
  if s.assignee is null then
    raise exception 'shift_empty';
  end if;
  if s.swap_requested then
    return;
  end if;
  update public.shifts set swap_requested = true, updated_at = now()
   where night = p_night and slot = p_slot;
  perform public._log(me, 'request_swap', p_night, p_slot, jsonb_build_object('assignee', s.assignee));
end;
$$;

create function public.cancel_swap_request(p_night date, p_slot smallint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  s  public.shifts   := public._lock_shift(p_night, p_slot);
begin
  perform public._require_owner_or_admin(me, s);
  if not s.swap_requested then
    return;
  end if;
  perform public._cancel_pending_offers(p_night, p_slot);
  update public.shifts set swap_requested = false, updated_at = now()
   where night = p_night and slot = p_slot;
  perform public._log(me, 'cancel_swap_request', p_night, p_slot, jsonb_build_object('assignee', s.assignee));
end;
$$;

create function public.offer_swap(p_night date, p_slot smallint) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  me   public.profiles := public._me();
  s    public.shifts;
  v_id bigint;
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
    return v_id;
  end if;

  insert into public.swap_offers (night, slot, requester, volunteer_id, volunteer)
  values (p_night, p_slot, s.assignee, me.id, me.display_name)
  returning id into v_id;

  perform public._notify_name(
    s.assignee,
    me.display_name || ' מוכן/ה לקחת את המשמרת שלך: ' || public._shift_label(p_night, p_slot),
    me.display_name || ' התנדב/ה לקחת את המשמרת שלך ב-' || public._shift_label(p_night, p_slot)
      || '. כדי שהחילוף יתבצע צריך לאשר אותו באפליקציה.');
  perform public._log(me, 'offer', p_night, p_slot, jsonb_build_object('requester', s.assignee));
  return v_id;
end;
$$;

create function public.withdraw_offer(p_offer_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  o  public.swap_offers;
begin
  select * into o from public.swap_offers where id = p_offer_id for update;
  if o.id is null or o.volunteer_id <> me.id then
    raise exception 'offer_not_found';
  end if;
  if o.status <> 'pending' then
    raise exception 'offer_not_pending';
  end if;
  update public.swap_offers set status = 'cancelled', decided_at = now() where id = o.id;
  perform public._log(me, 'withdraw_offer', o.night, o.slot, jsonb_build_object('requester', o.requester));
end;
$$;

create function public.accept_offer(p_offer_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me          public.profiles := public._me();
  o           public.swap_offers;
  s           public.shifts;
  v_volunteer text;
  other       public.swap_offers;
begin
  select * into o from public.swap_offers where id = p_offer_id for update;
  if o.id is null then
    raise exception 'offer_not_found';
  end if;
  if o.status <> 'pending' then
    raise exception 'offer_not_pending';
  end if;
  s := public._lock_shift(o.night, o.slot);
  perform public._require_owner_or_admin(me, s);
  perform public._require_future(o.night, o.slot);
  if not s.swap_requested or not public._same_name(s.assignee, o.requester) then
    raise exception 'stale_offer';
  end if;
  select display_name into v_volunteer from public.profiles where id = o.volunteer_id;
  if v_volunteer is null then
    raise exception 'stale_offer';
  end if;

  update public.shifts
     set assignee = v_volunteer, swap_requested = false, updated_at = now()
   where night = o.night and slot = o.slot;
  update public.swap_offers set status = 'accepted', decided_at = now() where id = o.id;

  for other in
    update public.swap_offers
       set status = 'declined', decided_at = now()
     where night = o.night and slot = o.slot and status = 'pending'
    returning *
  loop
    perform public._notify_id(
      other.volunteer_id,
      'המשמרת נמסרה למישהו אחר: ' || public._shift_label(o.night, o.slot),
      'תודה על ההתנדבות! המשמרת ב-' || public._shift_label(o.night, o.slot)
        || ' נמסרה ל-' || v_volunteer || '.');
  end loop;

  perform public._notify_id(
    o.volunteer_id,
    'החילוף אושר – המשמרת שלך: ' || public._shift_label(o.night, o.slot),
    s.assignee || ' אישר/ה את החילוף. המשמרת ב-' || public._shift_label(o.night, o.slot)
      || ' רשומה עכשיו עליך.');
  perform public._log(me, 'swap', o.night, o.slot,
                      jsonb_build_object('from', s.assignee, 'to', v_volunteer));
end;
$$;

create function public.decline_offer(p_offer_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  o  public.swap_offers;
  s  public.shifts;
begin
  select * into o from public.swap_offers where id = p_offer_id for update;
  if o.id is null then
    raise exception 'offer_not_found';
  end if;
  if o.status <> 'pending' then
    raise exception 'offer_not_pending';
  end if;
  s := public._lock_shift(o.night, o.slot);
  perform public._require_owner_or_admin(me, s);
  update public.swap_offers set status = 'declined', decided_at = now() where id = o.id;
  perform public._notify_id(
    o.volunteer_id,
    'ההתנדבות שלך לא אושרה: ' || public._shift_label(o.night, o.slot),
    s.assignee || ' לא אישר/ה את ההתנדבות שלך למשמרת ב-' || public._shift_label(o.night, o.slot) || '.');
  perform public._log(me, 'decline_offer', o.night, o.slot, jsonb_build_object('volunteer', o.volunteer));
end;
$$;

------------------------------------------------------------------------------------------------
-- Admin functions
------------------------------------------------------------------------------------------------

create function public.admin_set_assignee(p_night date, p_slot smallint, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me    public.profiles := public._me();
  v_old text;
begin
  perform public._require_admin(me);
  select assignee into v_old from public.shifts where night = p_night and slot = p_slot;
  if public._assign(p_night, p_slot, p_name) then
    perform public._log(me, 'admin_set', p_night, p_slot,
                        jsonb_build_object('from', v_old, 'to', public._clean_name(p_name)));
  end if;
end;
$$;

-- p_rows: [{"night": "2026-10-01", "slot1": "name or null", "slot2": "name or null"}, ...]
-- Returns the number of shifts that were created or changed.
create function public.admin_import(p_rows jsonb) returns integer
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
    v_from := least(v_from, v_night);
    v_to   := greatest(v_to, v_night);
  end loop;
  perform public._log(me, 'import', null, null,
                      jsonb_build_object('nights', jsonb_array_length(p_rows), 'changed', v_changed,
                                         'from', v_from, 'to', v_to));
  return v_changed;
end;
$$;

create function public.admin_add_nights(p_from date, p_to date) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me      public.profiles := public._me();
  v_count integer;
begin
  perform public._require_admin(me);
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'invalid_range';
  end if;
  insert into public.shifts (night, slot)
  select d::date, s::smallint
  from generate_series(p_from, p_to, interval '1 day') d
  cross join (values (1), (2)) v(s)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  perform public._log(me, 'add_nights', null, null,
                      jsonb_build_object('from', p_from, 'to', p_to, 'created', v_count));
  return v_count;
end;
$$;

create function public.admin_delete_nights(p_from date, p_to date) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me      public.profiles := public._me();
  v_count integer;
begin
  perform public._require_admin(me);
  if p_to < p_from then
    raise exception 'invalid_range';
  end if;
  delete from public.shifts where night between p_from and p_to;
  get diagnostics v_count = row_count;
  perform public._log(me, 'delete_nights', null, null,
                      jsonb_build_object('from', p_from, 'to', p_to, 'deleted', v_count));
  return v_count;
end;
$$;

create function public.admin_list_users()
returns table (id uuid, email text, display_name text, is_admin boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin(public._me());
  return query
    select p.id, p.email, p.display_name, p.is_admin, p.created_at
    from public.profiles p
    order by p.display_name nulls last, p.email;
end;
$$;

create function public.admin_set_admin(p_user_id uuid, p_is_admin boolean) returns void
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
  if not p_is_admin and target.is_admin
     and (select count(*) from public.profiles where is_admin) = 1 then
    raise exception 'last_admin';
  end if;
  update public.profiles set is_admin = p_is_admin where id = p_user_id;
  perform public._log(me, case when p_is_admin then 'grant_admin' else 'revoke_admin' end, null, null,
                      jsonb_build_object('user', coalesce(target.display_name, target.email)));
end;
$$;

-- Changes a user's roster name. With p_rename_shifts, shifts carrying the old name move to the new one.
create function public.admin_set_user_name(p_user_id uuid, p_name text, p_rename_shifts boolean)
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
  if p_rename_shifts and v_name is not null and target.display_name is not null then
    update public.shifts set assignee = v_name, updated_at = now()
     where public._same_name(assignee, target.display_name);
    update public.swap_offers set requester = v_name
     where status = 'pending' and public._same_name(requester, target.display_name);
    update public.swap_offers set volunteer = v_name
     where status = 'pending' and volunteer_id = p_user_id;
  end if;
  perform public._log(me, 'admin_rename_user', null, null,
                      jsonb_build_object('from', target.display_name, 'to', v_name,
                                         'shifts_renamed', p_rename_shifts));
end;
$$;

------------------------------------------------------------------------------------------------
-- Function privileges: only the public API is callable by signed-in users.
------------------------------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.shift_start(date, smallint),
  public.roster_names(),
  public.claim_name(text),
  public.take_shift(date, smallint),
  public.request_swap(date, smallint),
  public.cancel_swap_request(date, smallint),
  public.offer_swap(date, smallint),
  public.withdraw_offer(bigint),
  public.accept_offer(bigint),
  public.decline_offer(bigint),
  public.admin_set_assignee(date, smallint, text),
  public.admin_import(jsonb),
  public.admin_add_nights(date, date),
  public.admin_delete_nights(date, date),
  public.admin_list_users(),
  public.admin_set_admin(uuid, boolean),
  public.admin_set_user_name(uuid, text, boolean)
to authenticated;

------------------------------------------------------------------------------------------------
-- Realtime: clients refresh when shifts or offers change.
------------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shifts, public.swap_offers;
  end if;
end;
$$;
