-- An admin can act as another user: every action then runs with that user's identity and permissions,
-- and the history records both who it was done for and which admin did it.
--
-- The choice is stored per admin (not sent with each request), so it holds for every call until the admin
-- stops, and expires after 12 hours so a forgotten session does not linger.

create table public.acting_as (
  admin_id  uuid primary key references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  since     timestamptz not null default now()
);

alter table public.acting_as enable row level security;
revoke all on public.acting_as from public, anon, authenticated;

-- Who did it on someone else's behalf. Null for ordinary actions.
alter table public.audit_log add column by_id uuid references public.profiles (id) on delete set null;
alter table public.audit_log add column by_name text;
grant select (by_id, by_name) on public.audit_log to authenticated;

------------------------------------------------------------------------------------------------
-- The signed-in user, whatever they are acting as.
------------------------------------------------------------------------------------------------

create function public._caller() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then
    raise exception 'not_signed_in';
  end if;
  if p.status <> 'approved' then
    raise exception 'not_approved';
  end if;
  return p;
end;
$$;

-- The user every action runs as: the caller, or the user an admin is acting as.
create or replace function public._me() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles := public._caller();
  t public.profiles;
begin
  if p.is_admin then
    select pr.* into t
    from public.acting_as a join public.profiles pr on pr.id = a.target_id
    where a.admin_id = p.id and a.since > now() - interval '12 hours' and pr.status = 'approved';
    if t.id is not null then
      return t;
    end if;
  end if;
  return p;
end;
$$;

-- Writes the history row; when an admin acts for someone, records the admin as well.
create or replace function public._log(p public.profiles, p_action text, p_night date, p_slot smallint,
                                       p_details jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, actor_name, actor_email, action, night, slot, details, by_id, by_name)
  select p.id, p.display_name, p.email, p_action, p_night, p_slot, coalesce(p_details, '{}'),
         c.id, c.display_name
  from (select 1) one
  left join public.profiles c on c.id = auth.uid() and c.id is distinct from p.id;
$$;

------------------------------------------------------------------------------------------------
-- Starting and stopping
------------------------------------------------------------------------------------------------

-- Starts acting as the given user; null stops. Returns the user acted as, or null.
create function public.admin_act_as(p_user_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles := public._caller();
  target public.profiles;
begin
  perform public._require_admin(me);
  if p_user_id is null or p_user_id = me.id then
    delete from public.acting_as where admin_id = me.id;
    return null;
  end if;
  select * into target from public.profiles where id = p_user_id;
  if target.id is null or target.status <> 'approved' then
    raise exception 'user_not_found';
  end if;
  insert into public.acting_as (admin_id, target_id) values (me.id, target.id)
  on conflict (admin_id) do update set target_id = excluded.target_id, since = now();
  return target.id;
end;
$$;

-- The user the caller is acting as right now, or null.
create function public.my_act_as() returns uuid
language sql stable security definer set search_path = public as $$
  select a.target_id
  from public.acting_as a join public.profiles pr on pr.id = a.target_id
  where a.admin_id = (public._caller()).id and (public._caller()).is_admin
    and a.since > now() - interval '12 hours' and pr.status = 'approved';
$$;

-- The user list stays available while acting, to pick someone else or to stop.
create or replace function public.admin_list_users()
returns table (id uuid, email text, google_name text, display_name text, is_admin boolean, status text,
               created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin(public._caller());
  return query
    select p.id, p.email, p.google_name, p.display_name, p.is_admin, p.status, p.created_at
    from public.profiles p
    order by case p.status when 'pending' then 0 when 'approved' then 1 else 2 end,
             p.display_name nulls last, p.email;
end;
$$;

revoke execute on function public._caller(), public.admin_act_as(uuid), public.my_act_as() from public, anon;
grant execute on function public.admin_act_as(uuid), public.my_act_as() to authenticated;
