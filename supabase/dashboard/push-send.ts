// One-file copy of supabase/functions/push-send (index.ts + webpush.ts), for pasting into the Supabase
// dashboard's function editor. Generated from those files; change them, not this copy.
// Sends phone notifications (Web Push) for rows queued in public.push_outbox.
//
// - POST from a Database Webhook on INSERT into push_outbox: sends that row to every device of its user.
//   The row is re-read from the database and must still be unsent, so calling this from outside can only
//   send what is already queued.
// - GET ?public-key: the VAPID public key browsers subscribe with. The key pair is created on first use and
//   kept in public.push_keys (service role only), so there are no keys to copy by hand.
// Deployed with --no-verify-jwt (the webhook and the browser send no login).
import { createClient } from 'npm:@supabase/supabase-js@2';

// ---- Web Push (VAPID + aes128gcm) on WebCrypto ----
const enc = new TextEncoder();

/** WebCrypto wants buffers backed by a plain ArrayBuffer; all of ours are. */
const bs = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>;

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', bs(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, bs(data)));
}

/** HKDF with SHA-256 for outputs of at most 32 bytes (one expand block). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

interface VapidKeys {
  /** Uncompressed P-256 public key, base64url (65 bytes): given to browsers as applicationServerKey. */
  publicKey: string;
  /** The private key as a JWK, kept on the server only. */
  privateJwk: JsonWebKey;
}

async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64url(raw), privateJwk };
}

/** The VAPID Authorization header for a push service (the endpoint's origin). */
async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject };
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bs(enc.encode(`${header}.${payload}`))),
  );
  return `vapid t=${header}.${payload}.${b64url(signature)}, k=${keys.publicKey}`;
}

interface Subscription {
  endpoint: string;
  p256dh: string; // base64url, the browser's public key
  auth: string; // base64url, 16-byte auth secret
}

/** Encrypts a payload for one subscription (aes128gcm, a single record). */
async function encryptPayload(sub: Subscription, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', bs(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', bs(cek), 'AES-GCM', false, ['encrypt']);
  const padded = concat(payload, new Uint8Array([2])); // 0x02: the last (and only) record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(nonce) }, key, bs(padded)));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/** Sends one notification. Returns the push service's HTTP status (201 = accepted; 404/410 = gone). */
async function sendPush(
  sub: Subscription,
  message: { title: string; body: string; url?: string },
  keys: VapidKeys,
  subject: string,
): Promise<number> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body: bs(body),
  });
  return res.status;
}

// ---- HTTP handler ----
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
