import { supabase } from './supabase';
import type { AdminUser, RosterName, Slot, UserStatus } from './types';
import type { ImportRow } from './importSheet';

const ERROR_MESSAGES: Record<string, string> = {
  not_signed_in: 'צריך להתחבר מחדש.',
  choose_name_first: 'קודם צריך לבחור את השם שלך ברשימה.',
  invalid_name: 'השם צריך להיות באורך 2 עד 60 תווים.',
  name_already_chosen: 'כבר נבחר שם. כדי לשנות אותו צריך לפנות למנהל.',
  name_taken: 'השם הזה כבר שייך למשתמש אחר. אם זה השם שלך, אפשר לפנות למנהל.',
  shift_not_found: 'המשמרת לא קיימת.',
  shift_taken: 'מישהו אחר כבר לקח את המשמרת הזאת.',
  shift_in_past: 'המשמרת כבר התחילה או עברה.',
  shift_empty: 'המשמרת פנויה, אין ממי לבקש חילוף.',
  not_your_shift: 'זו לא המשמרת שלך.',
  no_swap_request: 'אין בקשת חילוף פעילה למשמרת הזאת.',
  already_assignee: 'המשמרת כבר שלך.',
  offer_not_found: 'ההתנדבות לא נמצאה.',
  offer_not_pending: 'ההתנדבות כבר טופלה.',
  request_exists: 'כבר שלחת בקשת חילוף על המשמרת הזאת. אפשר לבטל אותה ולשלוח חדשה.',
  request_not_found: 'בקשת החילוף לא נמצאה.',
  request_not_pending: 'בקשת החילוף כבר טופלה.',
  stale_request: 'אחת המשמרות השתנתה מאז שנשלחה הבקשה, ולכן אי אפשר לאשר אותה.',
  stale_offer: 'המשמרת השתנתה מאז ההתנדבות, ולכן אי אפשר לאשר אותה.',
  admin_only: 'הפעולה הזאת זמינה רק למנהלים.',
  not_approved: 'החשבון שלך עדיין לא אושר על ידי מנהל.',
  cannot_change_self: 'אי אפשר לשנות את הסטטוס של עצמך.',
  admin_must_stay_approved: 'קודם צריך להסיר את המשתמש מהמנהלים.',
  cannot_delete_admin: 'קודם צריך להסיר את המשתמש מהמנהלים.',
  invalid_import: 'אין שורות לייבוא.',
  import_too_large: 'אפשר לייבא עד 1000 לילות בפעם אחת.',
  invalid_range: 'טווח התאריכים לא תקין (עד 400 ימים).',
  user_not_found: 'המשתמש לא נמצא.',
  last_admin: 'אי אפשר להסיר את המנהל האחרון.',
};

export function translateError(message: string): string {
  const code = Object.keys(ERROR_MESSAGES).find((key) => message.startsWith(key));
  return code ? ERROR_MESSAGES[code] : `שגיאה: ${message}`;
}

async function call<T = void>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(translateError(error.message));
  return data as T;
}

const shiftArgs = (night: string, slot: Slot) => ({ p_night: night, p_slot: slot });

export const api = {
  rosterNames: () => call<RosterName[]>('roster_names'),
  claimName: (name: string) => call('claim_name', { p_name: name }),

  takeShift: (night: string, slot: Slot) => call('take_shift', shiftArgs(night, slot)),
  requestSwap: (night: string, slot: Slot) => call('request_swap', shiftArgs(night, slot)),
  cancelSwapRequest: (night: string, slot: Slot) => call('cancel_swap_request', shiftArgs(night, slot)),
  offerSwap: (night: string, slot: Slot) => call<number>('offer_swap', shiftArgs(night, slot)),
  withdrawOffer: (offerId: number) => call('withdraw_offer', { p_offer_id: offerId }),
  acceptOffer: (offerId: number) => call('accept_offer', { p_offer_id: offerId }),
  declineOffer: (offerId: number) => call('decline_offer', { p_offer_id: offerId }),
  sendSwapRequest: (night: string, slot: Slot, give: { night: string; slot: Slot } | null) =>
    call<number>('send_swap_request', {
      ...shiftArgs(night, slot),
      p_give_night: give?.night ?? null,
      p_give_slot: give?.slot ?? null,
    }),
  withdrawSwapRequest: (requestId: number) => call('withdraw_swap_request', { p_request_id: requestId }),
  acceptSwapRequest: (requestId: number) => call('accept_swap_request', { p_request_id: requestId }),
  declineSwapRequest: (requestId: number) => call('decline_swap_request', { p_request_id: requestId }),

  adminSetAssignee: (night: string, slot: Slot, name: string | null) =>
    call('admin_set_assignee', { ...shiftArgs(night, slot), p_name: name ?? '' }),
  adminImport: (rows: ImportRow[]) => call<number>('admin_import', { p_rows: rows }),
  adminAddNights: (from: string, to: string) => call<number>('admin_add_nights', { p_from: from, p_to: to }),
  adminDeleteNights: (from: string, to: string) =>
    call<number>('admin_delete_nights', { p_from: from, p_to: to }),
  adminListUsers: () => call<AdminUser[]>('admin_list_users'),
  adminSetStatus: (userId: string, status: UserStatus) =>
    call('admin_set_status', { p_user_id: userId, p_status: status }),
  adminSetAdmin: (userId: string, isAdmin: boolean) =>
    call('admin_set_admin', { p_user_id: userId, p_is_admin: isAdmin }),
  adminSetUserName: (userId: string, name: string, renameShifts: boolean) =>
    call('admin_set_user_name', { p_user_id: userId, p_name: name, p_rename_shifts: renameShifts }),
  adminDeleteUser: (userId: string) => call('admin_delete_user', { p_user_id: userId }),
};
