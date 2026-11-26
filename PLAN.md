# Shift Swaps – Implementation Plan

A mobile-first web app (Hebrew, RTL) for the night-guard roster: everyone sees all shifts, takes open
shifts, asks for a swap and hands shifts over. The app replaces the Google Sheet; the sheet is only used
once, as an import source, during the move.

## Decisions

| Topic | Decision |
|---|---|
| Source of truth | Supabase (Postgres). No sync with Google Sheets. |
| Sign-in | Google account (Supabase Auth). Anyone with a Google account may sign in. |
| Shifts | Two per night: first 00:00–03:00, second 03:00–06:00. |
| Swap flow | Hand-over: the owner marks "swap wanted", volunteers offer to take it, the owner approves one. Several volunteers may offer; the owner picks. |
| Releasing a shift | Not possible for regular users (only through a swap). Admins can edit any shift. |
| Limits | No limit on shifts per person or per night. |
| Admins | An admin list; the first admin is set by hand, admins can promote others. |
| Building the roster | Admins can paste the table from Google Sheets (with preview) and/or create empty nights for a date range and assign names. |
| History | Every action is recorded with the acting Google account, time and before/after values. |
| Notifications | E-mail: a volunteer offered to take your shift, your offer was approved/declined, a request you volunteered for was cancelled. |

## Data model

- `profiles` – one row per Google account: e-mail, roster name (`display_name`), `is_admin`.
- `shifts` – primary key `(night, slot)`; `assignee` (roster name or empty), `swap_requested`.
- `swap_offers` – a volunteer's offer for a shift: requester, volunteer, status
  (`pending` / `accepted` / `declined` / `cancelled`).
- `audit_log` – who did what and when.
- `email_outbox` – e-mails waiting to be sent by the `send-emails` edge function.

Shifts store the roster name as text, exactly as on the old sheet. On first sign-in a user picks
"who am I on the roster"; every shift with that name is then theirs. Admins can fix a wrong link.

All writes go through Postgres functions (RPC) that enforce the rules and write the audit log;
the browser only has read access to the tables. Taking a shift is a single conditional update, so two
people tapping the same open shift cannot both get it.

## Screens

1. **Sign-in** – "Sign in with Google".
2. **Who am I** – pick your name from the roster names, or type a new one.
3. **Calendar** – month view, every night with its two shifts. Open shifts, my shifts and swap requests
   are highlighted. Tapping a shift opens its actions.
4. **Swap board** – all future shifts with a swap request, and the offers on them.
5. **My shifts** – my upcoming shifts and my pending offers.
6. **History** – the audit log.
7. **Admin** – import from Sheets, create/delete nights, edit any shift, manage admins and user names.

## Stages

1. Setup: Supabase project, Google sign-in, app skeleton, deployment.
2. Sign-in and profile (roster name).
3. Calendar and taking open shifts.
4. Swaps: request, board, offer, approve/decline.
5. Admin: import, nights builder, manual edits, admin list.
6. History screen.
7. E-mail notifications.
8. Pilot with a few users, then everyone moves to the app and the sheet is retired.

## What the owner needs to set up

- A Supabase project (free tier).
- A Google OAuth client ID (Google Cloud Console, free).
- A Brevo account (free tier) with a verified sender address, for e-mails.

See `README.md` for step-by-step setup.
