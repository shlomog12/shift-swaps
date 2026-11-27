-- Phone notifications (Web Push). Every notice the app already sends by e-mail is also queued as a push for
-- the person's subscribed devices, and the push-send edge function delivers it (a Database Webhook on
-- INSERT into push_outbox calls it). Plus an evening reminder before each shift, if pg_cron is available.
-- Works in Chrome/Edge/Firefox (Android and desktop) and, on iPhone, once the app is on the home screen.

-- The VAPID key pair, created by the edge function on first use. Service role only.
create table public.push_keys (
  id          integer primary key check (id = 1),
  public_key  text not null,
  private_jwk jsonb not null,
  created_at  timestamptz not null default now()
);

-- One row per device (browser) that allowed notifications.
create table public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Notifications waiting to be sent by the edge function.
create table public.push_outbox (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  body       text not null,
  url        text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  error      text
);

alter table public.push_keys enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;
revoke all on public.push_keys, public.push_subscriptions, public.push_outbox from public, anon, authenticated;

-- Whether to get the evening reminder before a shift (on by default once notifications are on).
alter table public.profiles add column push_reminders boolean not null default true;

-- Queues a push for a user if they have a device subscribed.
create function public._push(p_user uuid, p_title text, p_body text, p_url text default null) returns void
language sql security definer set search_path = public as $$
  insert into public.push_outbox (user_id, title, body, url)
  select p_user, left(p_title, 120), left(p_body, 300), p_url
  where exists (select 1 from public.push_subscriptions where user_id = p_user);
$$;

-- The existing e-mail notices now also go out as pushes.
create or replace function public._notify_id(p_id uuid, p_subject text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.email_outbox (to_email, subject, body)
  select email, p_subject, p_body from public.profiles where id = p_id and email <> '';
  if p_id is not null then
    perform public._push(p_id, p_subject, p_body);
  end if;
end;
$$;

create or replace function public._notify_name(p_name text, p_subject text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.email_outbox (to_email, subject, body)
  select email, p_subject, p_body from public.profiles where public._same_name(display_name, p_name) and email <> '';
  for v_id in select id from public.profiles where public._same_name(display_name, p_name) loop
    perform public._push(v_id, p_subject, p_body);
  end loop;
end;
$$;

------------------------------------------------------------------------------------------------
-- The user's devices and settings. Subscriptions belong to the signed-in account (not to whoever an
-- admin is acting as), since they are this device's.
------------------------------------------------------------------------------------------------

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._caller();
begin
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'invalid_subscription';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (me.id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

create function public.delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (public._caller()).id;
$$;

create function public.my_push_settings() returns table (devices integer, reminders boolean)
language sql stable security definer set search_path = public as $$
  select (select count(*)::integer from public.push_subscriptions where user_id = me.id), me.push_reminders
  from public._caller() me;
$$;

create function public.set_push_reminders(p_on boolean) returns void
language sql security definer set search_path = public as $$
  update public.profiles set push_reminders = p_on where id = (public._caller()).id;
$$;

create function public.send_test_push() returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._caller();
begin
  if not exists (select 1 from public.push_subscriptions where user_id = me.id) then
    raise exception 'no_push_device';
  end if;
  perform public._push(me.id, 'התראת בדיקה', 'ההתראות של אפליקציית המשמרות עובדות במכשיר הזה.');
end;
$$;

------------------------------------------------------------------------------------------------
-- Evening reminder: tonight's shifts (dated tomorrow, from 00:00), for whoever wants reminders.
------------------------------------------------------------------------------------------------

create function public.queue_shift_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_tomorrow date := (now() at time zone 'Asia/Jerusalem')::date + 1;
  v_days     text[] := array['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  v_count    integer := 0;
  r          record;
begin
  for r in
    select s.night, s.slot, p.id as user_id
    from public.shifts s
    join public.profiles p on public._same_name(p.display_name, s.assignee)
    where s.night = v_tomorrow and p.status = 'approved' and p.push_reminders
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)
  loop
    perform public._push(
      r.user_id,
      'תזכורת: משמרת הלילה',
      'הלילה שבין ' || v_days[extract(dow from r.night - 1)::int + 1] || ' ל' || v_days[extract(dow from r.night)::int + 1]
        || ' · ' || case when r.slot = 1 then '00:00–03:00' else '03:00–06:00' end,
      './?shift=' || to_char(r.night, 'YYYY-MM-DD') || '_' || r.slot);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public._push(uuid, text, text, text), public.save_push_subscription(text, text, text),
  public.delete_push_subscription(text), public.my_push_settings(), public.set_push_reminders(boolean),
  public.send_test_push(), public.queue_shift_reminders()
  from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text),
  public.my_push_settings(), public.set_push_reminders(boolean), public.send_test_push()
  to authenticated;

-- Every evening at 18:00 UTC (20:00 in winter, 21:00 in summer in Israel), when pg_cron can be enabled.
-- Elsewhere (or if it fails), the rest of this file still applies; the reminder can be scheduled later.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname = 'shift-reminders';
      perform cron.schedule('shift-reminders', '0 18 * * *', 'select public.queue_shift_reminders()');
    exception when others then
      raise notice 'shift reminders not scheduled: %', sqlerrm;
    end;
  end if;
end;
$$;
