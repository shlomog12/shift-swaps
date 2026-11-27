# UX tasks

Backlog from the UX review. Numbers match the review; done tasks are kept for reference.

## Done

1. In-app confirmation dialog instead of the browser's confirm/prompt.
2. Toasts after every action; the shift sheet closes on success.
3. "Awaiting your decision" in "My shifts", with a badge on the tab.
4. "Your next shift" card at the top of the opening screen.
5. Dark mode following the device.
6. Gender-neutral wording.
26. One swap action per shift state; "swap request" vs "swap offer" terminology.
27. WhatsApp offer after an action is a dismissible bar, with "don't offer again".
28. Honest note on who can see the admin's phone.
29. Wording fixes in the WhatsApp features.
30. Share buttons as an outlined secondary style, after the main action.
31. Roster sharing at the top of the calendar, with clear labels.
32. Swap-offer form: "nothing in return" first, next two weeks of shifts first.
33. Incoming offers: buttons under the text.
34. Share offer uses the shared feedback component.
35. One "shift history" section in the shift sheet.
36. Profile sheet (settings, invitation, admin phone, sign-out).
7. Month grid: readable names (0.74rem, one line with ellipsis, full name on hover/aria).
8. Month grid: tapping a name opens that shift directly; tapping the day selects it.
9. Colour legend above the grid; swap requests also carry a ⇄ glyph.
10. Midnight rule explained once ("הבנתי"), then behind "איך לקרוא את היומן?"; the moon is gone.
12. Urgency tags ("הלילה", "מחר בלילה") on upcoming shifts in lists.
13. Swap board and open shifts grouped by week; open shifts beyond three weeks behind "show more".
37. Share my own shifts on WhatsApp from "My shifts" (two weeks / month, no link).
38. "Add to Google Calendar" on each of my upcoming shifts.
11. Optional notes on a swap request, on volunteering and on a direct swap offer: shown in the app,
    in WhatsApp messages, in history and in the owner's e-mail; cleared when the request ends.
14. Installable PWA: PNG icons (192/512/maskable/apple-touch), service worker (pages network-first, assets
    cached), install button in the profile, "no connection" bar.
39. Personal calendar subscription: `calendar_tokens` table and RPCs (create / replace token), the
    `calendar-feed` edge function serving an iCalendar feed, and a profile section with Google / iPhone
    subscribe links, copy, sharing and privacy notes, and "new link". Needs the migration applied and the
    function deployed (README, step 6).

22. Accessibility: SVG icons instead of emoji, 44px touch targets (36px compact), focus kept inside open
    sheets and dialogs and returned on close, aria-current on the active tab.
18. Name picker: names can be picked from the roster only (also enforced in the database); a
    spelling-tolerant search with "did you mean…?"; "my name is not on the list" asks an admin on WhatsApp.
21. History: grouped by day (today / yesterday / weekday and date), filters for all, involving me, swaps,
    assignments and users (admins).
23. Loading placeholders in the shape of the content instead of "טוען...".
20. Admin: a "reports" tab with shifts per person per month (bars, the average marked, "a lot" / "few"
    flags, first/second split), and an alert at the top of the admin screen on open shifts in the coming
    week, with a WhatsApp share.
24. Swipe between months in the calendar (RTL: drag right for the next month), with a short slide.
19. Admin: inner tabs (users with the pending badge, building nights, import); users as a list with a "⋯"
    action sheet, destructive actions set apart; search when there are many users.

Requested after the review:

40. Admin/user mode switch says what it does ("מעבר למצב משתמש" / "מעבר למצב מנהל"), a toast confirms the
    mode, and admin mode shows a yellow line under the top bar.
41. Month arrows are SVG chevrons pointing outwards (the ‹ › characters were mirrored by RTL).
42. Optional Hebrew dates (calendar toolbar or profile): Hebrew day in each cell, Hebrew months under the
    month title, the full Hebrew date in day details, lists and the shift sheet. Holidays, fasts and
    memorial days are always marked (dot in the grid, tag with the name), with Israeli rules for moved days.
43. Eves of days of rest (hollow ring in the grid, "ערב פסח" tag) and Shabbat (tinted Saturday cells,
    "שבת" / "ערב שבת" tags); the legend explains both.
44. The all / mine / open / swaps filters appear only in list view; the month grid always shows everything.
45. Sharing the roster and "my shifts" opens a dialog with the choices (instead of expanding in place), and
    the roster share button has room below it.

## Setup still to do (owner)

Done in code, waiting for steps in Supabase. Order matters: database first, then the function.

- [x] **Check which migrations are applied** (SQL Editor → New query → Run). It only checks, it changes nothing:
  ```sql
  select
    to_regclass('public.swap_requests')   is not null as swap_requests,
    exists (select 1 from information_schema.columns
            where table_name = 'profiles' and column_name = 'phone') as admin_phone,
    to_regclass('public.calendar_tokens') is not null as calendar;
  ```
  For every `false`, run its file below, in this order.
- [x] (already applied) `false` in swap_requests → run all of `supabase/migrations/20261201000000_swap_requests.sql`.
- [x] (already applied) `false` in admin_phone → run all of `supabase/migrations/20261202000000_admin_phones.sql`.
- [x] (applied) `false` in calendar → run all of `supabase/migrations/20261203000000_calendar_feed.sql`
      (task 39). Expected result: "Success. No rows returned".
- [x] (deployed from the Supabase dashboard) **Deploy the calendar function** (terminal, from the project folder, after the SQL above):
  ```sh
  git pull
  supabase functions deploy calendar-feed --no-verify-jwt
  ```
  First time on this computer: install the Supabase CLI, `supabase login`,
  `supabase link --project-ref <project-ref>` (README, step 5).
- [x] **Check the function**: open `https://<project-ref>.supabase.co/functions/v1/calendar-feed?token=test`.
      "not found" is correct; a 401 / JWT error means it was deployed without `--no-verify-jwt`.
- [x] (feed verified; Google refreshes subscribed calendars on its own schedule) **Check in the app**: profile → "חיבור המשמרות ליומן" → "הוספה ליומן גוגל", and confirm the shifts
      appear on the right dates and times.

- [x] (applied) **Swap notes (task 11)**: SQL Editor → run all of `supabase/migrations/20261204000000_swap_notes.sql`.
      Until then the app works as before, and notes are simply not saved.

- [x] (applied) **Roster-only names (task 18)**: SQL Editor → run all of
      `supabase/migrations/20261205000000_claim_roster_name_only.sql`. Until then the app already hides
      the free-text name, but the database would still accept one.

## Next, in recommended order

Nothing left before the last group.


## Closed without building

17. Mutual swap between two shifts. Covered by swap offers: offering one of my shifts in return is a
    mutual swap, and the owner accepts or declines it in one step.

## Last (decide at the end)

15. Reminder by e-mail or push X hours before a shift (Supabase cron + the existing e-mail queue).
25. Profile: notification preferences (only if task 15 is built).
