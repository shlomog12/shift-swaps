import { addDays, dayName, formatDate, israelNow } from './dates';
import type { AuditEntry } from './types';

export type HistoryCategory = 'swaps' | 'shifts' | 'users';

const CATEGORY: Record<string, HistoryCategory> = {
  request_swap: 'swaps',
  cancel_swap_request: 'swaps',
  offer: 'swaps',
  withdraw_offer: 'swaps',
  swap: 'swaps',
  decline_offer: 'swaps',
  send_swap_request: 'swaps',
  withdraw_swap_request: 'swaps',
  accept_swap_request: 'swaps',
  decline_swap_request: 'swaps',
  take: 'shifts',
  admin_set: 'shifts',
  admin_set_plan: 'shifts',
  import: 'shifts',
  add_nights: 'shifts',
  delete_nights: 'shifts',
};

/** Which filter an action belongs to; anything about accounts and names counts as "users". */
export function historyCategory(action: string): HistoryCategory {
  return CATEGORY[action] ?? 'users';
}

/** The Israel date of a timestamp, as "YYYY-MM-DD". */
export function israelDay(timestamp: string): string {
  return israelNow(new Date(timestamp)).date;
}

/** "היום", "אתמול", or "יום שלישי · 24.11.2026". */
export function dayHeading(day: string, today: string): string {
  if (day === today) return 'היום';
  if (day === addDays(today, -1)) return 'אתמול';
  return `יום ${dayName(day)} · ${formatDate(day)}`;
}

const NAME_FIELDS = ['assignee', 'from', 'to', 'requester', 'volunteer', 'owner', 'user'];

/** Whether I did it, or my roster name appears in it (my shift, my swap, my offer). */
export function involvesMe(entry: AuditEntry, myId: string, myName: string | null): boolean {
  if (entry.actor_id === myId) return true;
  if (!myName) return false;
  const mine = myName.toLowerCase();
  return NAME_FIELDS.some((field) => {
    const value = entry.details?.[field];
    return typeof value === 'string' && value.toLowerCase() === mine;
  });
}
