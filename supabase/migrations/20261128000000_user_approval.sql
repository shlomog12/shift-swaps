-- New users need an admin's approval before they can see or do anything.
-- Users who signed in before this migration are approved.

alter table public.profiles
  add column status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  add column google_name text;

update public.profiles set status = 'approved';

update public.profiles p
   set google_name = coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from auth.users u
 where u.id = p.id;

grant select (status) on public.profiles to authenticated;

------------------------------------------------------------------------------------------------
-- Reading requires approval (a user can always read their own profile, to see their status).
------------------------------------------------------------------------------------------------

create function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved');
$$;

drop policy profiles_read on public.profiles;
drop policy shifts_read on public.shifts;
drop policy swap_offers_read on public.swap_offers;
drop policy audit_log_read on public.audit_log;

create policy profiles_read    on public.profiles    for select to authenticated using (id = auth.uid() or public.is_approved());
create policy shifts_read      on public.shifts      for select to authenticated using (public.is_approved());
create policy swap_offers_read on public.swap_offers for select to authenticated using (public.is_approved());
create policy audit_log_read   on public.audit_log   for select to authenticated using (public.is_approved());

------------------------------------------------------------------------------------------------
-- Every action resolves the caller through _me(), so requiring approval there covers them all.
------------------------------------------------------------------------------------------------

create or replace function public._me() returns public.profiles
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

-- roster_names did not go through _me(); it now requires approval too.
create or replace function public.roster_names()
returns table (name text, claimed boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._me();
  return query
    with names as (
      select distinct s.assignee as name from public.shifts s where s.assignee is not null
      union
      select p.display_name from public.profiles p where p.display_name is not null
    )
    select n.name,
           exists (select 1 from public.profiles p where public._same_name(p.display_name, n.name))
    from names n
    order by n.name;
end;
$$;

------------------------------------------------------------------------------------------------
-- Sign-up: remember the Google name and tell the admins someone is waiting.
------------------------------------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_google_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name');
  v_who         text := coalesce(v_google_name, new.email, '') || ' (' || coalesce(new.email, '') || ')';
begin
  insert into public.profiles (id, email, google_name)
  values (new.id, coalesce(new.email, ''), v_google_name)
  on conflict (id) do nothing;

  insert into public.email_outbox (to_email, subject, body)
  select email,
         'משתמש חדש ממתין לאישור: ' || v_who,
         v_who || ' התחבר/ה לאפליקציית המשמרות ומחכה לאישור. אפשר לאשר או לדחות בלשונית ניהול.'
  from public.profiles
  where is_admin and email <> '';
  return new;
end;
$$;

------------------------------------------------------------------------------------------------
-- Admin: approve or reject users.
------------------------------------------------------------------------------------------------

create function public.admin_set_status(p_user_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles := public._me();
  target public.profiles;
  v_who  text;
begin
  perform public._require_admin(me);
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'invalid_status';
  end if;
  select * into target from public.profiles where id = p_user_id for update;
  if target.id is null then
    raise exception 'user_not_found';
  end if;
  if target.id = me.id then
    raise exception 'cannot_change_self';
  end if;
  if target.is_admin and p_status <> 'approved' then
    raise exception 'admin_must_stay_approved';
  end if;
  if target.status = p_status then
    return;
  end if;

  v_who := coalesce(target.display_name, target.google_name, target.email);

  -- A rejected user gives up their roster name and pending offers.
  if p_status = 'rejected' then
    update public.swap_offers set status = 'cancelled', decided_at = now()
     where volunteer_id = target.id and status = 'pending';
  end if;
  update public.profiles
     set status = p_status,
         display_name = case when p_status = 'rejected' then null else display_name end
   where id = target.id;

  if p_status = 'approved' then
    perform public._notify_id(
      target.id,
      'החשבון שלך באפליקציית המשמרות אושר',
      'המנהל אישר את החשבון שלך. אפשר להיכנס לאפליקציה ולבחור את השם שלך ברשימה.');
  end if;

  perform public._log(me,
                      case p_status when 'approved' then 'approve_user'
                                    when 'rejected' then 'reject_user'
                                    else 'unapprove_user' end,
                      null, null, jsonb_build_object('user', v_who));
end;
$$;

-- Making someone an admin also approves them.
create or replace function public.admin_set_admin(p_user_id uuid, p_is_admin boolean) returns void
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
  update public.profiles
     set is_admin = p_is_admin,
         status = case when p_is_admin then 'approved' else status end
   where id = p_user_id;
  perform public._log(me, case when p_is_admin then 'grant_admin' else 'revoke_admin' end, null, null,
                      jsonb_build_object('user', coalesce(target.display_name, target.google_name, target.email)));
end;
$$;

-- The user list now includes status and Google name; the return type changes, so recreate it.
drop function public.admin_list_users();

create function public.admin_list_users()
returns table (id uuid, email text, google_name text, display_name text, is_admin boolean, status text,
               created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin(public._me());
  return query
    select p.id, p.email, p.google_name, p.display_name, p.is_admin, p.status, p.created_at
    from public.profiles p
    order by case p.status when 'pending' then 0 when 'approved' then 1 else 2 end,
             p.display_name nulls last, p.email;
end;
$$;

------------------------------------------------------------------------------------------------
-- Privileges for the new and recreated functions.
------------------------------------------------------------------------------------------------

revoke execute on function
  public.is_approved(),
  public.admin_set_status(uuid, text),
  public.admin_list_users()
from public, anon;

grant execute on function
  public.is_approved(),
  public.admin_set_status(uuid, text),
  public.admin_list_users()
to authenticated;
