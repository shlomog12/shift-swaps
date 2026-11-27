import { describe, expect, it } from 'vitest';
import { b64url, encryptPayload, fromB64url, generateVapidKeys, vapidAuthorization } from './webpush.ts';

const dec = new TextDecoder();

async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
const concat = (...p: Uint8Array[]) => {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) (out.set(x, i), (i += x.length));
  return out;
};
const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) =>
  (await hmac(await hmac(salt, ikm), concat(info, new Uint8Array([1])))).slice(0, len);

/** What a browser does with an incoming push: decrypt it with its private key (RFC 8291). */
async function browserDecrypt(body: Uint8Array, uaKeys: CryptoKeyPair, authSecret: Uint8Array) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey));
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256));
  const enc = new TextEncoder();
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  return { rs, idlen, text: dec.decode(plain.slice(0, plain.lastIndexOf(2))) };
}

describe('web push', () => {
  it('encrypts a payload the browser can decrypt', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const p256dh = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey)));
    const message = JSON.stringify({ title: 'דנה התנדבה למשמרת שלך', body: '3.12 · 00:00–03:00' });
    const body = await encryptPayload(
      { endpoint: 'https://push.example/x', p256dh, auth: b64url(auth) },
      new TextEncoder().encode(message),
    );
    const out = await browserDecrypt(body, ua, auth);
    expect(out.rs).toBe(4096);
    expect(out.idlen).toBe(65);
    expect(out.text).toBe(message);
  });

  it('signs a VAPID token the push service can verify', async () => {
    const keys = await generateVapidKeys();
    expect(fromB64url(keys.publicKey)).toHaveLength(65);
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://example.org/app/');
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(keys.publicKey);
    const [h, p, s] = token.split('.');
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(p)));
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('https://example.org/app/');
    const pub = await crypto.subtle.importKey('raw', fromB64url(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pub,
      fromB64url(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(ok).toBe(true);
  });
});
