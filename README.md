# Shift Swaps

Mobile-first web app (Hebrew, RTL) for the night-guard roster: a calendar of all shifts (two per night,
00:00–03:00 and 03:00–06:00), taking open shifts, asking for a swap, a swap board, approving hand-overs,
a full history of who did what, and admin tools for building the roster. See [PLAN.md](PLAN.md).

- **Frontend:** React + TypeScript (Vite), static site on GitHub Pages.
- **Backend:** Supabase – Postgres, Google sign-in, Realtime, an edge function for e-mails.
- All rules live in the database (`supabase/migrations`): the browser can only read tables, every change
  goes through a Postgres function that checks permissions and writes the audit log.

## Project layout

| Path | Contents |
|---|---|
| `src/components` | Screens: calendar, shift actions, swap board, my shifts, history, admin |
| `src/lib` | Supabase client, RPC wrappers, data loading, dates, Google Sheets import parser |
| `supabase/migrations` | Database schema, permissions and business rules |
| `supabase/tests` | Rule tests that run the schema on a plain Postgres |
| `supabase/functions/send-emails` | Edge function that sends queued e-mails through Brevo |
| `supabase/functions/calendar-feed` | Edge function that serves a user's shifts as an iCalendar feed |
| `.github/workflows/ci.yml` | Tests on every push; deploys `main` to GitHub Pages |

## Setup

### 1. Supabase project

1. Create a free project at [supabase.com](https://supabase.com) (region: Frankfurt is closest to Israel).
2. **SQL Editor** → for each file in `supabase/migrations`, oldest first: paste its contents → **Run**.
3. **Project Settings → API**: note the *Project URL* and the *anon public* key.

### 2. Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com) create a project.
2. **APIs & Services → OAuth consent screen**: user type *External*, fill in the app name and your e-mail,
   keep the default scopes (email, profile). Then **Publish app** – with only these scopes Google does not
   require a review, and while the app is in *Testing* only listed test users can sign in.
3. **Credentials → Create credentials → OAuth client ID** → *Web application*.
   Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. In Supabase: **Authentication → Sign In / Providers → Google** → enable, paste the client ID and secret.
5. **Authentication → URL Configuration**:
   - Site URL: `https://<github-user>.github.io/shift-swaps/`
   - Redirect URLs: the same URL, plus `http://localhost:5173/` for local development.

### 3. Deployment (GitHub Pages)

1. Repository **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (the anon key is public by design; access is enforced by the database).
3. Push to `main`. The workflow runs the tests and publishes the site.

### 4. First admin

Sign in to the app once, pick your name, then run in the Supabase SQL Editor:

```sql
update public.profiles set is_admin = true where email = 'your-address@gmail.com';
```

From then on, admins can promote others from the **ניהול** tab. Admins can switch between the admin view
and the regular user's view with the button in the top bar.

Users pick their roster name once, on first sign-in; after that only an admin can change it.

An admin does not need a roster name: a system manager who runs the roster but is not one of the guards
(for example a rotating duty officer's account). Approve a new sign-up with **כאחראי מערכת** in the
**ניהול** tab, or make an approved user without a name an admin. They have exactly the same rights as any
other admin; the only difference is that no roster name is theirs, so they appear as "אחראי מערכת".
Removing them from the admins sends them to the name picker.

Any admin can act as another user with **בשם…** in the top bar: pick a roster name and the app shows what
that user sees, and every action (taking a shift, a swap request, approving an offer) runs on the server as
that user, with that user's permissions. The history shows "<admin> בשם <user>". The choice is kept on the
server (table `acting_as`) until the admin leaves it, and expires after 12 hours. A roster name nobody has
claimed yet can only be viewed.

The history is private: a user sees only the entries about them (they did it, an admin did it for them, or
their roster name is in it). Only admins see all of it. The database enforces this.

### 5. E-mail notifications

1. Create a free [Brevo](https://www.brevo.com) account, verify a sender address
   (**Senders, Domains & Dedicated IPs → Senders**) and create an API key (**SMTP & API → API Keys**).
2. Deploy the function (needs the [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   supabase functions deploy send-emails --no-verify-jwt
   supabase secrets set BREVO_API_KEY=... SENDER_EMAIL=... WEBHOOK_SECRET=<random string> \
     APP_URL=https://<github-user>.github.io/shift-swaps/
   ```
3. **Database → Webhooks → Create**: table `email_outbox`, event *Insert*, type *Supabase Edge Function*,
   function `send-emails`, add HTTP header `x-webhook-secret` with the same random string.

Failed sends keep their error in `email_outbox.error`. Without this step the app works the same, just
without e-mails.

### 6. Calendar subscription (optional)

Lets each user subscribe to their own shifts in Google Calendar or on an iPhone (profile → "המשמרות שלי ביומן").

1. Run `supabase/migrations/20261203000000_calendar_feed.sql` in the SQL Editor (if you have not applied all
   migrations yet).
2. Deploy the function. It must run without a login, because calendar apps send none; the secret token in the
   URL is the key, and users can replace it from the app:
   ```sh
   supabase functions deploy calendar-feed --no-verify-jwt
   ```
   It uses `APP_URL` (set in step 5) for the link in each event; without it the events simply have no link.

Google refreshes subscribed calendars on its own schedule (usually every few hours, sometimes a day), so the
shift sheet also keeps a one-off "add to Google Calendar" button.

### 7. The original roster and the next one

Each shift keeps the **original** assignee (what the admin planned) next to the current one. Imports and
building the roster set both; taking shifts, swaps and swap offers change only the current one. When an admin
edits a single shift, the app asks each time: only this time, or in the original too.

After applying `20261206000000_planned_roster.sql`, go to **ניהול → בניית לוח → הלוח המקורי** and run
"שחזור מההיסטוריה" once: it rebuilds the original from the history (undoing swaps back to each night's import)
and shows every change before saving. Saving replaces the original of those shifts (all swaps since each night's
import are dropped from it, an admin's "original too" edits stay), so it asks to type "שחזור" to confirm.
Admins can then view the original in the calendar ("מקורי") and count
by it in the reports.

**יצירת לוח המשך** builds the next period from the original of an existing one: same order and spacing,
optionally on the same weekdays and with first and second shifts swapped, and with people replaced or leaving
(their shifts become open). Nothing is assigned automatically: the preview is an editable table where the
admin fills a leaver's shifts (marked) and sets a newcomer's, and saving works like an import.

### 8. Moving the roster over

In the **ניהול** tab, copy the table from Google Sheets (date, day, first shift, second shift), paste it,
check the preview and import. Each person then signs in and picks their name from the roster names.

## Development

```sh
cp .env.example .env.local   # fill in the Supabase URL and anon key
npm install
npm run dev                  # http://localhost:5173
npm test                     # unit tests
supabase/tests/run.sh        # database rule tests; needs PGHOST/PGPORT/PGUSER of a throwaway Postgres
```

Schema changes go in a new file under `supabase/migrations` and are applied in the SQL Editor
(or with `supabase db push`).
