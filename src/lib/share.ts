import type { ShiftKey, Slot } from './types';

const PARAM = 'shift';
const STORAGE_KEY = 'open-shift';

/** A link that opens the app on the given shift: …/?shift=2026-12-03_1 */
export function shiftLink(night: string, slot: Slot): string {
  return `${window.location.origin}${window.location.pathname}?${PARAM}=${night}_${slot}`;
}

/** The app's own address, for invitations and approval messages. */
export function appLink(): string {
  // "?s=2" changes nothing in the app. WhatsApp caches a link's preview per exact address, and the plain
  // address was cached before the app had a preview image; bump the number if the preview changes again.
  return `${window.location.origin}${window.location.pathname}?s=2`;
}

/** Opens WhatsApp with the text; with a phone (e.g. 972501234567) it goes straight to that chat. */
export function whatsappUrl(text: string, phone?: string | null): string {
  return `https://wa.me/${phone ?? ''}?text=${encodeURIComponent(text)}`;
}

function parse(value: string | null): ShiftKey | null {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})_([12])$/);
  return match ? { night: match[1], slot: Number(match[2]) as Slot } : null;
}

/**
 * Moves a shared shift from the address bar to local storage, so it survives the Google sign-in
 * (which returns to the page without the query string) and waiting for approval.
 */
export function captureSharedShift(): void {
  const url = new URL(window.location.href);
  const value = url.searchParams.get(PARAM);
  if (value === null) return;
  if (parse(value)) localStorage.setItem(STORAGE_KEY, value);
  url.searchParams.delete(PARAM);
  window.history.replaceState(null, '', url.toString());
}

/** The shift a shared link asked to open, if any. */
export function readSharedShift(): ShiftKey | null {
  return parse(localStorage.getItem(STORAGE_KEY));
}

/** Called once the shared shift has been opened, so it opens only once. */
export function clearSharedShift(): void {
  localStorage.removeItem(STORAGE_KEY);
}
