-- Personal calendar subscription: each user can get a secret token; the calendar-feed edge function
-- serves that user's shifts as an iCalendar feed at a URL carrying the token, so Google Calendar or an
-- iPhone keeps them up to date. Anyone holding the URL sees the shifts (dates and times only), so the
-- user can replace the token at any time, which stops the old URL.

create table public.calendar_tokens (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.calendar_tokens enable row level security;
-- No policies and no grants: only the functions below (and the service role) touch it.
revoke all on public.calendar_tokens from public, anon, authenticated;

-- 64 hex characters from two random UUIDs (about 244 random bits); core Postgres, no extension needed.
create function public._new_calendar_token() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

-- The caller's token, created on first use.
create function public.my_calendar_token() returns text
language plpgsql security definer set search_path = public as $$
declare
  me      public.profiles := public._me();
  v_token text;
begin
  perform public._require_named(me);
  if me.status <> 'approved' then
    raise exception 'not_approved';
  end if;
  select token into v_token from public.calendar_tokens where user_id = me.id;
  if v_token is null then
    insert into public.calendar_tokens (user_id, token) values (me.id, public._new_calendar_token())
    returning token into v_token;
  end if;
  return v_token;
end;
$$;

-- Replaces the caller's token; the old URL stops working.
create function public.reset_calendar_token() returns text
language plpgsql security definer set search_path = public as $$
declare
  me      public.profiles := public._me();
  v_token text := public._new_calendar_token();
begin
  perform public._require_named(me);
  if me.status <> 'approved' then
    raise exception 'not_approved';
  end if;
  insert into public.calendar_tokens (user_id, token) values (me.id, v_token)
  on conflict (user_id) do update set token = excluded.token, created_at = now();
  return v_token;
end;
$$;

-- The shifts behind a token: from a month back to a year ahead, for an approved user with a roster name.
-- Called only by the calendar-feed edge function, with the service role.
create function public.calendar_feed(p_token text)
returns table (owner text, night date, slot smallint, swap_requested boolean, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.display_name, s.night, s.slot, s.swap_requested, s.updated_at
  from public.calendar_tokens t
  join public.profiles p on p.id = t.user_id
  join public.shifts s on lower(s.assignee) = lower(p.display_name)
  where t.token = p_token
    and length(p_token) = 64
    and p.status = 'approved'
    and p.display_name is not null
    and s.night between current_date - 31 and current_date + 366
  order by s.night, s.slot;
$$;

-- Owner name even when there are no shifts yet, so the feed can still be named and served.
create function public.calendar_feed_owner(p_token text) returns text
language sql stable security definer set search_path = public as $$
  select p.display_name
  from public.calendar_tokens t
  join public.profiles p on p.id = t.user_id
  where t.token = p_token and length(p_token) = 64 and p.status = 'approved' and p.display_name is not null;
$$;

revoke execute on function public._new_calendar_token(), public.my_calendar_token(), public.reset_calendar_token(),
  public.calendar_feed(text), public.calendar_feed_owner(text) from public, anon, authenticated;
grant execute on function public.my_calendar_token(), public.reset_calendar_token() to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.calendar_feed(text), public.calendar_feed_owner(text) to service_role;
  end if;
end;
$$;
