-- History privacy: a user reads only the entries that concern them (they did it, an admin did it for them,
-- or their roster name appears in it). Admins read everything.

-- Mirrors involvesMe() in src/lib/historyView.ts.
create function public._history_visible(p_actor uuid, p_by uuid, p_details jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.status = 'approved'
      and (
        p.is_admin
        or p.id = p_actor
        or p.id = p_by
        or (p.display_name is not null and exists (
              select 1
              from unnest(array['assignee', 'from', 'to', 'requester', 'volunteer', 'owner', 'user']) f
              where lower(p_details ->> f) = lower(p.display_name)))
      )
  );
$$;

revoke execute on function public._history_visible(uuid, uuid, jsonb) from public, anon;
grant execute on function public._history_visible(uuid, uuid, jsonb) to authenticated;

drop policy audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log for select to authenticated
  using (public._history_visible(actor_id, by_id, details));
