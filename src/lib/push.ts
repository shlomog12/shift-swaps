import { api } from './api';
import { b64urlToBytes } from './bytes';
import { isIos, isStandalone } from './pwa';
import { supabaseUrl } from './supabase';

export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Where this device stands: unsupported, iPhone not installed yet, blocked by the user, off or on. */
export async function pushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/** The VAPID public key, from the push-send edge function (which creates the key pair on first use). */
async function publicKey(): Promise<string> {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/push-send?public-key`);
  if (!res.ok) throw new Error('שירות ההתראות עוד לא הוגדר בשרת (הפונקציה push-send).');
  return (await res.json()).publicKey;
}

/** Asks for permission, subscribes this device and saves it. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('ההתראות לא אושרו בדפדפן.');
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(await publicKey()) }));
  const json = sub.toJSON();
  await api.savePushSubscription(sub.endpoint, json.keys?.p256dh ?? '', json.keys?.auth ?? '');
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.deletePushSubscription(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
}

