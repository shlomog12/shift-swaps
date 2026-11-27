-- Payments in three stages: waiting to be paid, paid and waiting for the payee to confirm, received.
-- "Paid" no longer closes a payment on its own: the payee confirms ("received") or answers "not received",
-- which sends it back to waiting. A payment marked paid and not answered for 7 days counts as settled.

-- The payer marks it paid: the payee is asked to confirm.
create or replace function public.mark_payment_paid(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  p  public.swap_payments := public._payment_for(p_id);
begin
  if not (public._is_payer(me, p) or me.is_admin) then
    raise exception 'not_your_payment';
  end if;
  update public.swap_payments set paid_at = coalesce(paid_at, now()) where id = p.id;
  perform public._notify_id(p.payee_id, 'סומן תשלום של ₪' || p.amount || ' אליך מ' || p.payer,
    'על המשמרת ב-' || public._shift_label(p.night, p.slot)
    || '. אם הכסף הגיע, כדאי לאשר בלשונית "שלי". אם לא, אפשר לסמן שם "לא קיבלתי".');
  perform public._log(me, 'payment_paid', p.night, p.slot,
                      jsonb_build_object('payer', p.payer, 'payee', p.payee, 'amount', p.amount));
end;
$$;

-- The payee says the money has not arrived: the payment goes back to waiting, and the payer is told.
create function public.payment_not_received(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  p  public.swap_payments := public._payment_for(p_id);
begin
  if not (coalesce(p.payee_id = me.id, false) or me.is_admin) then
    raise exception 'not_your_payment';
  end if;
  if p.paid_at is null or p.received_at is not null then
    raise exception 'payment_not_marked_paid';
  end if;
  update public.swap_payments set paid_at = null where id = p.id;
  if p.payer_id is not null then
    perform public._notify_id(p.payer_id, p.payee || ': התשלום של ₪' || p.amount || ' עוד לא הגיע',
      'על המשמרת ב-' || public._shift_label(p.night, p.slot)
      || '. כדאי לבדוק בפייבוקס שההעברה בוצעה, ולסמן שוב "שילמתי" כשהיא עוברת.');
  end if;
  perform public._log(me, 'payment_not_received', p.night, p.slot,
                      jsonb_build_object('payer', p.payer, 'payee', p.payee, 'amount', p.amount));
end;
$$;

-- Payments not settled yet (admins): waiting to be paid, or paid in the last 7 days and not confirmed.
create or replace function public.admin_open_payments()
returns setof public.swap_payments
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin(public._me());
  return query
    select * from public.swap_payments
    where received_at is null and cancelled_at is null
      and (paid_at is null or paid_at > now() - interval '7 days')
    order by night, slot;
end;
$$;

revoke execute on function public.payment_not_received(bigint) from public, anon;
grant execute on function public.payment_not_received(bigint) to authenticated;
