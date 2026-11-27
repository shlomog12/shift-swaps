-- In-app inbox: every notice the app sends (approvals, offers, payments, reminders) is also kept for the
-- person to read in the app, whether or not they turned on phone notifications. Kept for 60 days.

create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  body       text not null,
  url        text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;

-- Every push is also an inbox entry; the push itself is queued only for users with a device subscribed.
create or replace function public._push(p_user uuid, p_title text, p_body text, p_url text default null) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, url)
  select p_user, left(p_title, 120), left(p_body, 300), p_url
  where p_user is not null;
  insert into public.push_outbox (user_id, title, body, url)
  select p_user, left(p_title, 120), left(p_body, 300), p_url
  where exists (select 1 from public.push_subscriptions where user_id = p_user);
$$;

-- The latest 50 entries of the user the caller acts as (so an admin acting for someone sees their inbox).
create function public.my_notifications()
returns table (id bigint, title text, body text, url text, created_at timestamptz, read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, n.title, n.body, n.url, n.created_at, n.read_at
  from public.notifications n, public._me() me
  where n.user_id = me.id and n.created_at > now() - interval '60 days'
  order by n.created_at desc
  limit 50;
$$;

-- Marks the caller's own entries read. While an admin acts for someone it does nothing, so the person still
-- sees their entries as new.
create function public.mark_notifications_read() returns void
language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles := public._me();
  caller public.profiles := public._caller();
begin
  if me.id <> caller.id then
    return;
  end if;
  update public.notifications set read_at = now() where user_id = me.id and read_at is null;
  delete from public.notifications where user_id = me.id and created_at < now() - interval '60 days';
end;
$$;

revoke execute on function public._push(uuid, text, text, text), public.my_notifications(),
  public.mark_notifications_read() from public, anon, authenticated;
grant execute on function public.my_notifications(), public.mark_notifications_read() to authenticated;
