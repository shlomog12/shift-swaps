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
14. Installable PWA: PNG icons (192/512/maskable/apple-touch), service worker (pages network-first, assets
    cached), install button in the profile, "no connection" bar.
39. Personal calendar subscription: `calendar_tokens` table and RPCs (create / replace token), the
    `calendar-feed` edge function serving an iCalendar feed, and a profile section with Google / iPhone
    subscribe links, copy, sharing and privacy notes, and "new link". Needs the migration applied and the
    function deployed (README, step 6).

## P1

11. Optional note on a swap request and on volunteering (schema + RPC change).
15. Reminder by e-mail or push X hours before a shift (Supabase cron).

## P2

17. Mutual swap between two shifts. (Largely covered by swap offers with a shift in return.)
18. Name picker: "did you mean…?" for names close to an existing one.
19. Admin: inner tabs (users, roster, import), user actions in a "⋯" menu.
20. Admin: fairness report (shifts per person per month), alert on open shifts in the coming week.
21. History: group by day, "only mine", filter by action type.
22. Accessibility: SVG icons instead of emoji, 44px touch targets, focus trap in sheets.
23. Skeleton loading, "offline" indicator.
24. Swipe between months in the calendar.
25. Profile: notification preferences (once reminders exist).
