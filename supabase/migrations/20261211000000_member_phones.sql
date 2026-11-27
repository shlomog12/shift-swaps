-- A phone number for every user (until now only admins could add one). Signed-in, approved members see the
-- numbers of the others who added one, so WhatsApp messages about swaps open that person's chat directly.
-- Payments use the same number for Bit/PayBox; the separate payment phone is copied over and no longer used.

-- Stores the caller's phone in international form without "+" (e.g. 972501234567); empty clears it.
create or replace function public.set_my_phone(p_phone text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me      public.profiles := public._me();
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if v_phone = '' then
    v_phone := null;
  elsif v_phone like '00%' then
    v_phone := substr(v_phone, 3);
  elsif v_phone ~ '^0\d{8,9}$' then
    v_phone := '972' || substr(v_phone, 2);
  end if;
  if v_phone is not null and v_phone !~ '^[1-9]\d{8,14}$' then
    raise exception 'invalid_phone';
  end if;
  update public.profiles set phone = v_phone where id = me.id;
  return v_phone;
end;
$$;

create function public.my_phone() returns text
language sql stable security definer set search_path = public as $$
  select phone from public.profiles where id = (public._me()).id;
$$;

-- Roster names with a phone, for approved members only.
create function public.member_phones() returns table (name text, phone text)
language sql stable security definer set search_path = public as $$
  select p.display_name, p.phone
  from public.profiles p, public._caller() c
  where p.status = 'approved' and p.display_name is not null and p.phone is not null
  order by 1;
$$;

-- 972501234567 -> 0501234567 (what Bit / PayBox expect); other countries keep "+".
create function public._local_phone(p_phone text) returns text
language sql immutable as $$
  select case when p_phone is null then null
              when p_phone like '972%' then '0' || substr(p_phone, 4)
              else '+' || p_phone end;
$$;

update public.profiles set phone = '972' || substr(payment_phone, 2)
where phone is null and payment_phone ~ '^0\d{8,9}$';

create or replace function public.payment_contact(p_id bigint)
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
  return query select p.payee, public._local_phone(pr.phone), pr.payment_link from public.profiles pr where pr.id = p.payee_id;
end;
$$;

create or replace function public.my_payment_details() returns table (phone text, link text)
language sql stable security definer set search_path = public as $$
  select public._local_phone(phone), payment_link from public.profiles where id = (public._me()).id;
$$;

-- Saves the caller's PayBox link (the phone comes from set_my_phone).
create function public.set_my_payment_link(p_link text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles := public._me();
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
begin
  perform public._require_named(me);
  if v_link is not null and (v_link !~ '^https://' or length(v_link) > 300) then
    raise exception 'invalid_link';
  end if;
  update public.profiles set payment_link = v_link where id = me.id;
end;
$$;

revoke execute on function public.my_phone(), public.member_phones(), public._local_phone(text),
  public.set_my_payment_link(text) from public, anon;
grant execute on function public.my_phone(), public.member_phones(), public.set_my_payment_link(text) to authenticated;
