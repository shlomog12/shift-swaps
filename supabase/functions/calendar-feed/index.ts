// Serves one person's shifts as an iCalendar feed, for subscribing in Google Calendar or on an iPhone.
// GET /functions/v1/calendar-feed?token=<64 hex chars>. Deployed with --no-verify-jwt: calendar apps
// send no login, so the secret token in the URL is the only key (users can replace it in the app).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildIcs, type FeedShift } from './ics.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (request: Request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 });
  }
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return new Response('not found', { status: 404 });
  }

  const owner = await supabase.rpc('calendar_feed_owner', { p_token: token });
  if (owner.error) return new Response('error', { status: 500 });
  if (!owner.data) return new Response('not found', { status: 404 });

  const shifts = await supabase.rpc('calendar_feed', { p_token: token });
  if (shifts.error) return new Response('error', { status: 500 });

  const body = buildIcs(owner.data as string, (shifts.data ?? []) as FeedShift[], Deno.env.get('APP_URL') ?? '');
  return new Response(request.method === 'HEAD' ? null : body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="shifts.ics"',
      'cache-control': 'private, max-age=900',
    },
  });
});
