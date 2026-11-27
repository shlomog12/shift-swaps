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
3. Have new `push_outbox` rows call the function: in the SQL Editor run
   `supabase/dashboard/push-outbox-trigger.sql` with `PROJECT_REF` replaced by the project's id (a trigger
   with pg_net). A Database Webhook (Integrations → Database Webhooks: table `push_outbox`, *Insert*,
   Supabase Edge Function `push-send`) does the same.
4. In the app: profile → "התראות לטלפון" → turn on, then "שליחת התראת בדיקה".

### Exporting the roster

**ניהול → ייבוא/ייצוא → ייצוא ל־CSV** downloads any date range as a CSV file (date, night, first shift,
second shift), current or original. It opens in Excel and Google Sheets with Hebrew intact, and the import
accepts the same file back.

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
