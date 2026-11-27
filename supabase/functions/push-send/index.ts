// Sends phone notifications (Web Push) for rows queued in public.push_outbox.
//
// - POST from a Database Webhook on INSERT into push_outbox: sends that row to every device of its user.
//   The row is re-read from the database and must still be unsent, so calling this from outside can only
//   send what is already queued.
// - GET ?public-key: the VAPID public key browsers subscribe with. The key pair is created on first use and
//   kept in public.push_keys (service role only), so there are no keys to copy by hand.
// Deployed with --no-verify-jwt (the webhook and the browser send no login).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateVapidKeys, sendPush, type VapidKeys } from './webpush.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const SUBJECT = Deno.env.get('APP_URL') || 'https://shlomog12.github.io/shift-swaps/';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };

async function vapidKeys(): Promise<VapidKeys> {
  const { data } = await supabase.from('push_keys').select('public_key, private_jwk').eq('id', 1).maybeSingle();
  if (data) return { publicKey: data.public_key, privateJwk: data.private_jwk };
  const keys = await generateVapidKeys();
  // If two requests race, the first insert wins and both read it back.
  await supabase.from('push_keys').insert({ id: 1, public_key: keys.publicKey, private_jwk: keys.privateJwk });
  const again = await supabase.from('push_keys').select('public_key, private_jwk').eq('id', 1).single();
  return { publicKey: again.data!.public_key, privateJwk: again.data!.private_jwk };
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  if (request.method === 'GET') {
    const keys = await vapidKeys();
    return Response.json({ publicKey: keys.publicKey }, { headers: CORS });
  }
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const payload = await request.json().catch(() => null);
  const id = payload?.record?.id;
  if (payload?.type !== 'INSERT' || typeof id !== 'number') return new Response('ignored');

  const { data: row } = await supabase.from('push_outbox').select('*').eq('id', id).is('sent_at', null).maybeSingle();
  if (!row) return new Response('nothing to send');

  const keys = await vapidKeys();
  const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', row.user_id);
  const results: string[] = [];
  for (const sub of subs ?? []) {
    try {
      const status = await sendPush(sub, { title: row.title, body: row.body, url: row.url ?? undefined }, keys, SUBJECT);
      results.push(String(status));
      // The device unsubscribed or the subscription expired.
      if (status === 404 || status === 410) await supabase.from('push_subscriptions').delete().eq('id', sub.id);
    } catch (error) {
      results.push(error instanceof Error ? error.message : String(error));
    }
  }
  const ok = results.some((r) => r.startsWith('2'));
  await supabase
    .from('push_outbox')
    .update({ sent_at: new Date().toISOString(), error: ok || results.length === 0 ? null : results.join('; ').slice(0, 500) })
    .eq('id', row.id);
  return new Response(results.join(',') || 'no devices');
});
