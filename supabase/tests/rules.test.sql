-- Rule tests for the schema. Run with ./run.sh against a throwaway database.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create schema test;
grant usage on schema test to authenticated;

create function test.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id::text, false);
$$;

create function test.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_message || '%' then
      raise exception 'expected "%" from [%], got "%"', p_message, p_sql, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected "%" from [%], but it succeeded', p_message, p_sql;
end;
$$;

create function test.eq(p_actual anyelement, p_expected anyelement, p_what text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '%: expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

grant execute on all functions in schema test to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com');

select test.eq((select count(*) from public.profiles), 4::bigint, 'profiles created on sign-up');
-- The migration approves existing users; new sign-ups below start as pending.
update public.profiles set status = 'pending';
update public.profiles set is_admin = true, status = 'approved', display_name = 'מנהל'
 where id = '00000000-0000-0000-0000-00000000000a';

-- Dates relative to today so the tests keep working.
create table test.d as
select (now() at time zone 'Asia/Jerusalem')::date + 10 as f1,
       (now() at time zone 'Asia/Jerusalem')::date + 11 as f2,
       (now() at time zone 'Asia/Jerusalem')::date - 3  as past;
grant select on test.d to authenticated;

set role authenticated;

-- Admin builds the roster.
select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.eq(public.admin_add_nights((select f1 from test.d), (select f2 from test.d)), 4, 'empty nights created');
select test.eq(public.admin_import(jsonb_build_array(
  jsonb_build_object('night', (select f1 from test.d), 'slot1', '  בוסי ', 'slot2', 'חסן'),
  jsonb_build_object('night', (select past from test.d), 'slot1', null, 'slot2', 'חסן'))), 4, 'import changes');
select test.eq((select assignee from public.shifts where night = (select f1 from test.d) and slot = 1), 'בוסי', 'name trimmed');
select test.eq(public.admin_import(jsonb_build_array(
  jsonb_build_object('night', (select f1 from test.d), 'slot1', 'בוסי', 'slot2', 'חסן'))), 0, 're-import is a no-op');

-- Pending users see nothing and can do nothing.
select test.as_user('00000000-0000-0000-0000-00000000000b');
select test.eq((select count(*) from public.shifts), 0::bigint, 'pending user reads no shifts');
select test.eq((select count(*) from public.profiles), 1::bigint, 'pending user reads only own profile');
select test.eq((select status from public.profiles), 'pending', 'pending user sees own status');
select test.expect_error('select public.claim_name(''בוסי'')', 'not_approved');
select test.expect_error('select * from public.roster_names()', 'not_approved');
select test.expect_error('select public.admin_set_status(''00000000-0000-0000-0000-00000000000b'', ''approved'')', 'not_approved');

select test.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_set_status('00000000-0000-0000-0000-00000000000b', 'approved');
select public.admin_set_status('00000000-0000-0000-0000-00000000000c', 'approved');
select public.admin_set_status('00000000-0000-0000-0000-00000000000d', 'approved');
select test.expect_error('select public.admin_set_status(''00000000-0000-0000-0000-00000000000a'', ''rejected'')', 'cannot_change_self');

-- B must pick a name first.
select test.as_user('00000000-0000-0000-0000-00000000000b');
select test.eq((select count(*) from public.shifts) > 0, true, 'approved user reads shifts');
select test.expect_error(format('select public.take_shift(%L, 1::smallint)', (select f2 from test.d)), 'choose_name_first');
select public.claim_name('בוסי');
select test.expect_error('select public.claim_name(''משהו אחר'')', 'name_already_chosen');
select test.expect_error('select public.admin_import(''[{"night":"2030-01-01"}]'')', 'admin_only');

-- C cannot take B's name.
select test.as_user('00000000-0000-0000-0000-00000000000c');
select test.expect_error('select public.claim_name(''בוסי'')', 'name_taken');
select public.claim_name('דהן');

-- Swap: B asks, C and D offer, B approves C.
select test.as_user('00000000-0000-0000-0000-00000000000b');
select test.expect_error(format('select public.request_swap(%L, 2::smallint)', (select f1 from test.d)), 'not_your_shift');
select public.request_swap((select f1 from test.d), 1::smallint);
select test.expect_error(format('select public.offer_swap(%L, 1::smallint)', (select f1 from test.d)), 'already_assignee');

select test.as_user('00000000-0000-0000-0000-00000000000c');
select test.expect_error(format('select public.offer_swap(%L, 2::smallint)', (select f1 from test.d)), 'no_swap_request');
select public.offer_swap((select f1 from test.d), 1::smallint) as c_offer \gset
select test.eq(public.offer_swap((select f1 from test.d), 1::smallint), :c_offer::bigint, 'offering twice returns the same offer');
select test.expect_error(format('select public.accept_offer(%s)', :c_offer), 'not_your_shift');

select test.as_user('00000000-0000-0000-0000-00000000000d');
select public.claim_name('לוי');
select public.offer_swap((select f1 from test.d), 1::smallint) as d_offer \gset

select test.as_user('00000000-0000-0000-0000-00000000000b');
select public.accept_offer(:c_offer);
select test.eq((select assignee from public.shifts where night = (select f1 from test.d) and slot = 1), 'דהן', 'shift handed over');
select test.eq((select swap_requested from public.shifts where night = (select f1 from test.d) and slot = 1), false, 'swap flag cleared');
select test.eq((select status from public.swap_offers where id = :d_offer), 'declined', 'other offer declined');
select test.expect_error(format('select public.accept_offer(%s)', :d_offer), 'offer_not_pending');

-- Taking open shifts, races and past shifts.
select test.as_user('00000000-0000-0000-0000-00000000000d');
select public.take_shift((select f2 from test.d), 1::smallint);
select test.as_user('00000000-0000-0000-0000-00000000000c');
select test.expect_error(format('select public.take_shift(%L, 1::smallint)', (select f2 from test.d)), 'shift_taken');
select test.expect_error(format('select public.take_shift(%L, 1::smallint)', (select past from test.d)), 'shift_in_past');
select test.expect_error('select public.take_shift(''2099-01-01'', 1::smallint)', 'shift_not_found');

-- Cancelling a request cancels its offers.
select test.as_user('00000000-0000-0000-0000-00000000000d');
select public.request_swap((select f2 from test.d), 1::smallint);
select test.as_user('00000000-0000-0000-0000-00000000000c');
select public.offer_swap((select f2 from test.d), 1::smallint) as c_offer2 \gset
select test.as_user('00000000-0000-0000-0000-00000000000d');
select public.cancel_swap_request((select f2 from test.d), 1::smallint);
select test.eq((select status from public.swap_offers where id = :c_offer2), 'cancelled', 'offer cancelled with request');

-- Withdrawing an offer.
select public.request_swap((select f2 from test.d), 1::smallint);
select test.as_user('00000000-0000-0000-0000-00000000000c');
select public.offer_swap((select f2 from test.d), 1::smallint) as c_offer3 \gset
select test.as_user('00000000-0000-0000-0000-00000000000b');
select test.expect_error(format('select public.withdraw_offer(%s)', :c_offer3), 'offer_not_found');
select test.as_user('00000000-0000-0000-0000-00000000000c');
select public.withdraw_offer(:c_offer3);

-- Direct writes and private columns are blocked.
select test.expect_error('update public.shifts set assignee = ''x''', 'permission denied');
select test.expect_error('insert into public.audit_log (action) values (''x'')', 'permission denied');
select test.expect_error('select email from public.profiles', 'permission denied');
select test.expect_error('select actor_email from public.audit_log', 'permission denied');
select test.expect_error('select * from public.email_outbox', 'permission denied');
select test.expect_error('select public._assign(''2030-01-01'', 1::smallint, ''x'')', 'permission denied');
select test.expect_error('select * from public.admin_list_users()', 'admin_only');

-- Admin tools.
select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.eq((select count(*) from public.admin_list_users()), 4::bigint, 'admin sees users');
select test.expect_error('select public.admin_set_admin(''00000000-0000-0000-0000-00000000000a'', false)', 'last_admin');
select public.admin_set_admin('00000000-0000-0000-0000-00000000000b', true);
select test.expect_error('select public.admin_set_status(''00000000-0000-0000-0000-00000000000b'', ''rejected'')', 'admin_must_stay_approved');
select public.admin_set_user_name('00000000-0000-0000-0000-00000000000c', 'דהן משה', true);
select test.eq((select assignee from public.shifts where night = (select f1 from test.d) and slot = 1), 'דהן משה', 'rename moves shifts');
select public.admin_set_assignee((select f2 from test.d), 2::smallint, 'חדש');
select public.admin_set_assignee((select f2 from test.d), 1::smallint, '');
select test.eq((select assignee from public.shifts where night = (select f2 from test.d) and slot = 1), null::text, 'admin clears shift');
select test.eq((select swap_requested from public.shifts where night = (select f2 from test.d) and slot = 1), false, 'clearing drops request');
select test.eq(public.admin_delete_nights((select f2 from test.d), (select f2 from test.d)), 2, 'nights deleted');
select test.eq((select count(*) from public.roster_names() where name = 'חסן' and not claimed), 1::bigint, 'roster names');

reset role;
select test.eq((select count(*) from public.email_outbox where to_email = 'b@example.com'), 3::bigint, 'b e-mails: approved, one per offer');
select test.eq((select count(*) from public.email_outbox where to_email = 'c@example.com'), 3::bigint, 'c e-mails: approved, offer approved, request cancelled');
select test.eq((select count(*) from public.email_outbox where to_email = 'd@example.com'), 4::bigint, 'd e-mails: approved, declined, two offers on own shift');

-- A new sign-up notifies the admins (A and B by now) and can be rejected.
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000000e', 'e@example.com', '{"full_name": "Eve Stranger"}');
select test.eq((select count(*) from public.email_outbox where subject like '%Eve Stranger%'), 2::bigint, 'admins told about new user');
select test.eq((select google_name from public.profiles where email = 'e@example.com'), 'Eve Stranger', 'google name stored');
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.eq((select status from public.admin_list_users() where email = 'e@example.com'), 'pending', 'admin sees pending user');
select public.admin_set_status('00000000-0000-0000-0000-00000000000e', 'rejected');
select test.as_user('00000000-0000-0000-0000-00000000000e');
select test.expect_error(format('select public.take_shift(%L, 2::smallint)', (select f1 from test.d)), 'not_approved');
select test.eq((select status from public.profiles), 'rejected', 'rejected user sees own status');
select test.eq((select count(*) from public.audit_log), 0::bigint, 'rejected user reads no history');
reset role;
select test.eq((select actor_email from public.audit_log where action = 'swap'), 'b@example.com', 'audit records actor');

-- An admin unlinks D from the name 'לוי': D's pending offer is cancelled and D picks a name again.
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000c');
select public.request_swap((select f1 from test.d), 1::smallint);
select test.as_user('00000000-0000-0000-0000-00000000000d');
select public.offer_swap((select f1 from test.d), 1::smallint);
select test.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_set_user_name('00000000-0000-0000-0000-00000000000d', '', false);
select test.eq((select display_name from public.admin_list_users() where email = 'd@example.com'), null::text, 'name cleared');
select test.eq((select count(*) from public.swap_offers where volunteer_id = '00000000-0000-0000-0000-00000000000d'
                and status = 'pending'), 0::bigint, 'clearing a name cancels pending offers');
select test.eq((select count(*) from public.roster_names() where name = 'לוי' and claimed), 0::bigint, 'cleared name is free');
select test.eq((select details->>'from' from public.audit_log where action = 'admin_clear_user_name'), 'לוי', 'clear logged');
select test.as_user('00000000-0000-0000-0000-00000000000d');
select public.claim_name('לוי חדש');
reset role;

-- Deleting a user removes the account, the profile and their offers; signing in again starts over.
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a');
select public.request_swap((select f1 from test.d), 2::smallint);
select test.as_user('00000000-0000-0000-0000-00000000000d');
select public.offer_swap((select f1 from test.d), 2::smallint);
select test.expect_error('select public.admin_delete_user(''00000000-0000-0000-0000-00000000000c'')', 'admin_only');
select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.expect_error('select public.admin_delete_user(''00000000-0000-0000-0000-00000000000a'')', 'cannot_change_self');
select test.expect_error('select public.admin_delete_user(''00000000-0000-0000-0000-00000000000b'')', 'cannot_delete_admin');
select public.admin_delete_user('00000000-0000-0000-0000-00000000000d');
select test.eq((select count(*) from public.admin_list_users() where email = 'd@example.com'), 0::bigint, 'user deleted');
select test.eq((select count(*) from public.swap_offers where night = (select f1 from test.d) and slot = 2), 0::bigint,
               'deleted user offers removed');
select test.eq((select details->>'user' from public.audit_log where action = 'delete_user'), 'לוי חדש', 'delete logged');
reset role;
select test.eq((select count(*) from auth.users where email = 'd@example.com'), 0::bigint, 'auth account removed');
select test.eq((select count(*) from public.email_outbox where to_email = 'd@example.com' and sent_at is null), 0::bigint,
               'unsent e-mails dropped');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000d', 'd@example.com');
select test.eq((select status from public.profiles where email = 'd@example.com'), 'pending', 'returning user starts over');

-- Direct swap requests: C (דהן משה) asks B (בוסי) for a shift, in exchange or without.
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a');
select (f1 + 2)::text as f3, (f1 + 3)::text as f4 from test.d \gset
select public.admin_add_nights(:'f3', :'f4');
select public.admin_set_assignee(:'f3', 1::smallint, 'בוסי');
select public.admin_set_assignee(:'f3', 2::smallint, 'דהן משה');
select public.admin_set_assignee(:'f4', 1::smallint, 'בוסי');
select public.admin_set_assignee(:'f4', 2::smallint, 'חסן');

select test.as_user('00000000-0000-0000-0000-00000000000c');
select test.expect_error(format('select public.send_swap_request(%L, 2::smallint)', :'f3'), 'already_assignee');
select test.expect_error(format('select public.send_swap_request(%L, 1::smallint, %L, 1::smallint)', :'f3', :'f4'),
                         'not_your_shift');
select test.expect_error(format('select public.send_swap_request(%L, 1::smallint, %L, 1::smallint)', :'f3', (select past from test.d)),
                         'shift_in_past');
select public.send_swap_request(:'f3', 1::smallint, :'f3', 2::smallint) as r1 \gset
select test.expect_error(format('select public.send_swap_request(%L, 1::smallint)', :'f3'), 'request_exists');
select test.expect_error(format('select public.accept_swap_request(%s)', :r1), 'not_your_shift');
select public.send_swap_request(:'f4', 1::smallint) as r2 \gset

select test.as_user('00000000-0000-0000-0000-00000000000b');
select public.accept_swap_request(:r1);
select test.eq((select assignee from public.shifts where night = :'f3' and slot = 1), 'דהן משה', 'exchange: requester gets the shift');
select test.eq((select assignee from public.shifts where night = :'f3' and slot = 2), 'בוסי', 'exchange: owner gets the given shift');
select test.eq((select status from public.swap_requests where id = :r1), 'accepted', 'request accepted');
select test.expect_error(format('select public.accept_swap_request(%s)', :r1), 'request_not_pending');
select public.decline_swap_request(:r2);
select test.eq((select status from public.swap_requests where id = :r2), 'declined', 'request declined');

-- A request is cancelled when either shift changes hands; the requester can also withdraw.
select test.as_user('00000000-0000-0000-0000-00000000000c');
select public.send_swap_request(:'f4', 1::smallint, :'f3', 1::smallint) as r3 \gset
select public.send_swap_request(:'f4', 2::smallint) as r4 \gset
select public.withdraw_swap_request(:r4);
select test.eq((select status from public.swap_requests where id = :r4), 'cancelled', 'request withdrawn');
select test.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_set_assignee(:'f3', 1::smallint, 'חסן');
select test.eq((select status from public.swap_requests where id = :r3), 'cancelled', 'request cancelled when shift changes');
select test.as_user('00000000-0000-0000-0000-00000000000b');
select test.expect_error(format('select public.accept_swap_request(%s)', :r3), 'request_not_pending');
reset role;
select test.eq((select count(*) from public.email_outbox where subject like '%מבקש/ת %את המשמרת שלך%'
                or subject like '%מבקש/ת להחליף%'), 3::bigint, 'owners told about requests (חסן has no account)');

-- Admin phones: admins set them, signed-in users (even pending ones) see admins who added one.
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000c');
select test.expect_error('select public.set_my_phone(''0501234567'')', 'admin_only');
select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.eq(public.set_my_phone('050-123-4567'), '972501234567', 'local number normalized');
select test.eq(public.set_my_phone('+972 50 123 4567'), '972501234567', 'international number normalized');
select test.expect_error('select public.set_my_phone(''12'')', 'invalid_phone');
select test.as_user('00000000-0000-0000-0000-00000000000b');
select test.eq(public.set_my_phone(''), null::text, 'empty clears the phone');
select test.as_user('00000000-0000-0000-0000-00000000000d');
select test.eq((select status from public.profiles), 'pending', 'D is pending');
select test.eq((select count(*) from public.admin_contacts()), 1::bigint, 'pending user sees admins with a phone');
select test.eq((select phone from public.admin_contacts()), '972501234567', 'admin phone listed');
select test.expect_error('select phone from public.profiles', 'permission denied');
reset role;

\echo 'All rule tests passed.'
