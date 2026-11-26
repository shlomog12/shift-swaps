-- Admins can add a phone number, so a user waiting for approval can message them on WhatsApp
-- straight from the app. The number is shown only to signed-in users, through admin_contacts();
-- the column itself is not readable by other users.

alter table public.profiles add column phone text;

-- Stores the caller's phone in international form without "+" (e.g. 972501234567); empty clears it.
create function public.set_my_phone(p_phone text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me      public.profiles := public._me();
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  perform public._require_admin(me);
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

-- Admins who added a phone. Open to any signed-in user, including those still waiting for approval.
create function public.admin_contacts()
returns table (id uuid, name text, phone text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.display_name, p.google_name, 'מנהל'), p.phone
  from public.profiles p
  where auth.uid() is not null and p.is_admin and p.status = 'approved' and p.phone is not null
  order by 2;
$$;

revoke execute on function public.set_my_phone(text), public.admin_contacts() from public, anon;
grant execute on function public.set_my_phone(text), public.admin_contacts() to authenticated;
