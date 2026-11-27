-- Calls the push-send edge function for every new push_outbox row (instead of a dashboard Database Webhook).
-- Replace PROJECT_REF with the project's id (from the dashboard URL) and run it in the SQL Editor.
-- No secret needed: push-send only re-reads the row by id and sends it if it is still unsent.

create extension if not exists pg_net;

create or replace function public._push_outbox_send() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://PROJECT_REF.supabase.co/functions/v1/push-send',
    body    := jsonb_build_object('type', 'INSERT', 'record', jsonb_build_object('id', new.id)),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;

drop trigger if exists push_outbox_send on public.push_outbox;
create trigger push_outbox_send after insert on public.push_outbox
  for each row execute function public._push_outbox_send();
