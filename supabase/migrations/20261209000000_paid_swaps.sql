-- Paid swaps. A swap request (the owner looks for a replacement) or a direct swap offer with nothing in
-- return ("I'll take your shift") can carry an amount, ₪1–500. Whoever hands over the shift pays whoever
-- takes it. When the swap is accepted, a payment is recorded; the app never moves money, it shows who pays
-- whom and how (the payee's Bit/PayBox phone or PayBox link), and either side marks it settled.

alter table public.shifts add column swap_price integer check (swap_price is null or swap_price between 1 and 500);
alter table public.swap_offers add column price integer check (price is null or price between 1 and 500);
alter table public.swap_requests add column price integer check (price is null or price between 1 and 500);

-- How to pay someone: read only through payment_contact(), by whoever owes them.
alter table public.profiles add column payment_phone text;
alter table public.profiles add column payment_link text;

create table public.swap_payments (
  id          bigint generated always as identity primary key,
  night       date not null,
  slot        smallint not null,
  payer       text not null,           -- roster name of who handed over the shift
  payer_id    uuid references public.profiles (id) on delete set null,
  payee       text not null,           -- roster name of who took it
  payee_id    uuid references public.profiles (id) on delete set null,
  amount      integer not null check (amount between 1 and 500),
  source      text not null check (source in ('offer', 'request')),
  created_at  timestamptz not null default now(),
  paid_at     timestamptz,             -- the payer marked "paid"
  received_at timestamptz,             -- the payee marked "received"
  cancelled_at timestamptz             -- an admin cancelled it
);

alter table public.swap_payments enable row level security;
revoke all on public.swap_payments from public, anon, authenticated;
grant select on public.swap_payments to authenticated;
-- Each side sees their own payments, admins see all (realtime refreshes come through this too).
create policy swap_payments_read on public.swap_payments for select to authenticated
  using (payer_id = auth.uid() or payee_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin and p.status = 'approved'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.swap_payments;
  end if;
end;
$$;

-- An amount, or null for none. Out of range is an error.
create function public._clean_price(p_price integer) returns integer
language plpgsql immutable as $$
begin
  if p_price is null then
    return null;
  end if;
  if p_price < 1 or p_price > 500 then
    raise exception 'invalid_price';
  end if;
  return p_price;
end;
$$;

-- A request's amount, like its note, lives only as long as the request.
create or replace function public._clear_swap_note() returns trigger
language plpgsql as $$
begin
  if not new.swap_requested or new.assignee is distinct from old.assignee then
    new.swap_note := null;
    new.swap_price := null;
  end if;
  return new;
end;
$$;

-- Records a payment and tells both sides.
create function public._create_payment(p_night date, p_slot smallint, p_payer text, p_payee_id uuid,
                                       p_payee text, p_amount integer, p_source text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payer_id uuid;
begin
  select id into v_payer_id from public.profiles where public._same_name(display_name, p_payer) limit 1;
  insert into public.swap_payments (night, slot, payer, payer_id, payee, payee_id, amount, source)
  values (p_night, p_slot, p_payer, v_payer_id, p_payee, p_payee_id, p_amount, p_source);
  perform public._notify_name(
    p_payer,
    'תשלום של ₪' || p_amount || ' ל-' || p_payee || ' על החילוף',
    'החילוף על המשמרת ב-' || public._shift_label(p_night, p_slot) || ' אושר. יש להעביר ₪' || p_amount
      || ' ל-' || p_payee || '. פרטי התשלום והסימון "שילמתי" נמצאים באפליקציה, בלשונית "שלי".');
  perform public._notify_id(
    p_payee_id,
    p_payer || ' צריך/ה להעביר לך ₪' || p_amount,
    'על המשמרת ב-' || public._shift_label(p_night, p_slot) || ' מגיע לך ₪' || p_amount || ' מ-' || p_payer
      || '. כשהכסף מגיע, אפשר לסמן "קיבלתי" באפליקציה.');
end;
$$;

------------------------------------------------------------------------------------------------
-- Swap requests and offers with an amount.
------------------------------------------------------------------------------------------------

drop function public.request_swap(date, smallint, text);
create function public.request_swap(p_night date, p_slot smallint, p_note text default null,
                                    p_price integer default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  me      public.profiles := public._me();
  s       public.shifts   := public._lock_shift(p_night, p_slot);
  v_note  text            := public._clean_note(p_note);
  v_price integer         := public._clean_price(p_price);
begin
  perform public._require_owner_or_admin(me, s);
  perform public._require_future(p_night, p_slot);
  if s.assignee is null then
    raise exception 'shift_empty';
  end if;
  if s.swap_requested then
    -- Already open: a new note or amount replaces the old one.
    if p_note is not null or p_price is not null then
      update public.shifts
         set swap_note  = case when p_note is not null then v_note else swap_note end,
             swap_price = case when p_price is not null then v_price else swap_price end,
             updated_at = now()
       where night = p_night and slot = p_slot;
    end if;
    return;
  end if;
  update public.shifts set swap_requested = true, swap_note = v_note, swap_price = v_price, updated_at = now()
   where night = p_night and slot = p_slot;
  perform public._log(me, 'request_swap', p_night, p_slot,
                      jsonb_build_object('assignee', s.assignee, 'note', v_note, 'price', v_price));
end;
$$;

-- Volunteering keeps the amount offered at that moment.
create or replace function public.offer_swap(p_night date, p_slot smallint, p_note text default null) returns bigint
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

  insert into public.swap_offers (night, slot, requester, volunteer_id, volunteer, note, price)
  values (p_night, p_slot, s.assignee, me.id, me.display_name, v_note, s.swap_price)
  returning id into v_id;

  perform public._notify_name(
    s.assignee,
    me.display_name || ' מוכן/ה לקחת את המשמרת שלך: ' || public._shift_label(p_night, p_slot),
    me.display_name || ' התנדב/ה לקחת את המשמרת שלך ב-' || public._shift_label(p_night, p_slot)
      || coalesce(' (תמורת ₪' || s.swap_price || ')', '')
      || '. כדי שהחילוף יתבצע צריך לאשר אותו באפליקציה.' || public._note_line(v_note));
  perform public._log(me, 'offer', p_night, p_slot,
                      jsonb_build_object('requester', s.assignee, 'note', v_note, 'price', s.swap_price));
  return v_id;
end;
$$;

drop function public.send_swap_request(date, smallint, date, smallint, text);
create function public.send_swap_request(p_night date, p_slot smallint,
                                         p_give_night date default null, p_give_slot smallint default null,
                                         p_note text default null, p_price integer default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  me      public.profiles := public._me();
  s       public.shifts;
  g       public.shifts;
  v_id    bigint;
  v_note  text    := public._clean_note(p_note);
  v_price integer := public._clean_price(p_price);
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
  -- Money only for taking a shift with nothing in return; an exchange stays a plain exchange.
  if v_price is not null and p_give_night is not null then
    raise exception 'price_with_exchange';
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

  insert into public.swap_requests (night, slot, owner, requester_id, requester, give_night, give_slot, note, price)
  values (p_night, p_slot, s.assignee, me.id, me.display_name, p_give_night, p_give_slot, v_note, v_price)
  returning id into v_id;

  if p_give_night is null then
    perform public._notify_name(
      s.assignee,
      me.display_name || ' מבקש/ת לקחת את המשמרת שלך: ' || public._shift_label(p_night, p_slot),
      me.display_name || ' מבקש/ת לקחת ממך את המשמרת ב-' || public._shift_label(p_night, p_slot)
        || coalesce(', תמורת ₪' || v_price, ', בלי משמרת בתמורה')
        || '. אפשר לאשר או לדחות באפליקציה.' || public._note_line(v_note));
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
                                         'note', v_note, 'price', v_price));
  return v_id;
end;
$$;

------------------------------------------------------------------------------------------------
-- Accepting records the payment.
------------------------------------------------------------------------------------------------

create or replace function public.accept_offer(p_offer_id bigint) returns void
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
  if o.price is not null then
    perform public._create_payment(o.night, o.slot, s.assignee, o.volunteer_id, v_volunteer, o.price, 'offer');
  end if;
  perform public._log(me, 'swap', o.night, o.slot,
                      jsonb_build_object('from', s.assignee, 'to', v_volunteer, 'price', o.price));
end;
$$;

create or replace function public.accept_swap_request(p_request_id bigint) returns void
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
  if r.price is not null then
    perform public._create_payment(r.night, r.slot, s.assignee, r.requester_id, v_requester, r.price, 'request');
  end if;
  perform public._log(me, 'accept_swap_request', r.night, r.slot,
                      jsonb_build_object('from', s.assignee, 'to', v_requester,
                                         'give_night', r.give_night, 'give_slot', r.give_slot, 'price', r.price));
end;
$$;

------------------------------------------------------------------------------------------------
-- Payments.
------------------------------------------------------------------------------------------------

-- The caller's payments: owed by them or to them, newest first.
create function public.my_payments()
returns setof public.swap_payments
language sql stable security definer set search_path = public as $$
  select p.* from public.swap_payments p, public._me() me
  where p.payer_id = me.id or p.payee_id = me.id
     or (p.payer_id is null and public._same_name(p.payer, me.display_name))
  order by p.created_at desc
  limit 100;
$$;

-- Every payment not yet settled or cancelled (admins).
create function public.admin_open_payments()
returns setof public.swap_payments
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin(public._me());
  return query
    select * from public.swap_payments
    where paid_at is null and received_at is null and cancelled_at is null
    order by night, slot;
end;
$$;

create function public._payment_for(p_id bigint) returns public.swap_payments
language plpgsql security definer set search_path = public as $$
declare
  p public.swap_payments;
begin
  select * into p from public.swap_payments where id = p_id for update;
  if p.id is null then
    raise exception 'payment_not_found';
  end if;
  if p.cancelled_at is not null then
    raise exception 'payment_cancelled';
  end if;
  return p;
end;
$$;

create function public._is_payer(me public.profiles, p public.swap_payments) returns boolean
language sql immutable as $$
  select coalesce(p.payer_id = me.id, false)
      or (p.payer_id is null and coalesce(public._same_name(p.payer, me.display_name), false));
$$;

create function public.mark_payment_paid(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  p  public.swap_payments := public._payment_for(p_id);
begin
  if not (public._is_payer(me, p) or me.is_admin) then
    raise exception 'not_your_payment';
  end if;
  update public.swap_payments set paid_at = coalesce(paid_at, now()) where id = p.id;
  perform public._notify_id(p.payee_id, p.payer || ' סימן/ה שהעביר/ה לך ₪' || p.amount,
    'על המשמרת ב-' || public._shift_label(p.night, p.slot) || '. אם הכסף לא הגיע, כדאי לבדוק מול ' || p.payer || '.');
  perform public._log(me, 'payment_paid', p.night, p.slot,
                      jsonb_build_object('payer', p.payer, 'payee', p.payee, 'amount', p.amount));
end;
$$;

create function public.mark_payment_received(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  p  public.swap_payments := public._payment_for(p_id);
begin
  if not (coalesce(p.payee_id = me.id, false) or me.is_admin) then
    raise exception 'not_your_payment';
  end if;
  update public.swap_payments set received_at = coalesce(received_at, now()) where id = p.id;
  perform public._log(me, 'payment_received', p.night, p.slot,
                      jsonb_build_object('payer', p.payer, 'payee', p.payee, 'amount', p.amount));
end;
$$;

create function public.admin_cancel_payment(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  p  public.swap_payments := public._payment_for(p_id);
begin
  perform public._require_admin(me);
  update public.swap_payments set cancelled_at = now() where id = p.id;
  perform public._log(me, 'payment_cancelled', p.night, p.slot,
                      jsonb_build_object('payer', p.payer, 'payee', p.payee, 'amount', p.amount));
end;
$$;

-- How to pay the payee of a payment: only for its payer (or an admin), only while it is open.
create function public.payment_contact(p_id bigint)
returns table (name text, phone text, link text)
language plpgsql stable security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  p  public.swap_payments;
begin
  select * into p from public.swap_payments where id = p_id;
  if p.id is null then
    raise exception 'payment_not_found';
  end if;
  if not (public._is_payer(me, p) or me.is_admin) then
    raise exception 'not_your_payment';
  end if;
  return query select p.payee, pr.payment_phone, pr.payment_link from public.profiles pr where pr.id = p.payee_id;
end;
$$;

-- The caller's own payment details.
create function public.my_payment_details() returns table (phone text, link text)
language sql stable security definer set search_path = public as $$
  select payment_phone, payment_link from public.profiles where id = (public._me()).id;
$$;

-- Saves how to pay the caller: a phone for Bit/PayBox (stored as 05xxxxxxxx) and/or a PayBox link.
create function public.set_my_payment_details(p_phone text, p_link text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me      public.profiles := public._me();
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_link  text := nullif(btrim(coalesce(p_link, '')), '');
begin
  perform public._require_named(me);
  if v_phone like '972%' then
    v_phone := '0' || substr(v_phone, 4);
  end if;
  if v_phone = '' then
    v_phone := null;
  elsif v_phone !~ '^0\d{8,9}$' then
    raise exception 'invalid_phone';
  end if;
  if v_link is not null and (v_link !~ '^https://' or length(v_link) > 300) then
    raise exception 'invalid_link';
  end if;
  update public.profiles set payment_phone = v_phone, payment_link = v_link where id = me.id;
end;
$$;

revoke execute on function
  public._clean_price(integer), public._create_payment(date, smallint, text, uuid, text, integer, text),
  public._payment_for(bigint), public._is_payer(public.profiles, public.swap_payments),
  public.request_swap(date, smallint, text, integer),
  public.send_swap_request(date, smallint, date, smallint, text, integer),
  public.my_payments(), public.admin_open_payments(), public.mark_payment_paid(bigint),
  public.mark_payment_received(bigint), public.admin_cancel_payment(bigint), public.payment_contact(bigint),
  public.my_payment_details(), public.set_my_payment_details(text, text)
  from public, anon, authenticated;
grant execute on function
  public.request_swap(date, smallint, text, integer),
  public.send_swap_request(date, smallint, date, smallint, text, integer),
  public.my_payments(), public.admin_open_payments(), public.mark_payment_paid(bigint),
  public.mark_payment_received(bigint), public.admin_cancel_payment(bigint), public.payment_contact(bigint),
  public.my_payment_details(), public.set_my_payment_details(text, text)
  to authenticated;
