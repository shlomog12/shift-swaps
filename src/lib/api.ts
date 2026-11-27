import { supabase } from './supabase';
import type { AdminContact, AdminUser, RosterName, Slot, UserStatus } from './types';
import type { ImportRow } from './importSheet';

const ERROR_MESSAGES: Record<string, string> = {
  not_signed_in: 'צריך להתחבר מחדש.',
  choose_name_first: 'קודם צריך לבחור את השם שלך ברשימה.',
  invalid_name: 'השם צריך להיות באורך 2 עד 60 תווים.',
  name_already_chosen: 'כבר נבחר שם. כדי לשנות אותו צריך לפנות למנהל.',
  name_not_on_roster: 'אפשר לבחור רק שם שמופיע ברשימה. אם השם שלך לא שם, צריך לפנות למנהל.',
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
  request_exists: 'כבר שלחת הצעת החלפה על המשמרת הזאת. אפשר לבטל אותה ולשלוח חדשה.',
  request_not_found: 'הצעת ההחלפה לא נמצאה.',
  request_not_pending: 'הצעת ההחלפה כבר טופלה.',
  stale_request: 'אחת המשמרות השתנתה מאז שנשלחה ההצעה, ולכן אי אפשר לאשר אותה.',
  note_too_long: 'ההערה ארוכה מדי (עד 300 תווים).',
  stale_offer: 'המשמרת השתנתה מאז ההתנדבות, ולכן אי אפשר לאשר אותה.',
  admin_only: 'הפעולה הזאת זמינה רק למנהלים.',
  not_approved: 'החשבון שלך עדיין לא אושר על ידי מנהל.',
  cannot_change_self: 'אי אפשר לשנות את הסטטוס של עצמך.',
  admin_must_stay_approved: 'קודם צריך להסיר את המשתמש מהמנהלים.',
  cannot_delete_admin: 'קודם צריך להסיר את המשתמש מהמנהלים.',
  invalid_import: 'אין שורות לייבוא.',
  import_too_large: 'אפשר לייבא עד 1000 לילות בפעם אחת.',
  invalid_range: 'טווח התאריכים לא תקין (עד 400 ימים).',
  invalid_phone: 'מספר הטלפון לא תקין. אפשר לכתוב למשל 050-1234567.',
  user_not_found: 'המשתמש לא נמצא.',
  last_admin: 'אי אפשר להסיר את המנהל האחרון.',
};

export function translateError(message: string): string {
  const code = Object.keys(ERROR_MESSAGES).find((key) => message.startsWith(key));
  return code ? ERROR_MESSAGES[code] : `שגיאה: ${message}`;
}

async function call<T = void>(fn: string, args?: Record<string, unknown>): Promise<T> {
  let { data, error } = await supabase.rpc(fn, args);
  // Before a migration that adds an optional argument (a note, updating the original) is applied, the
  // function does not know it: do the action without it.
  const optional = ['p_note', 'p_update_plan'];
  if (error && args && optional.some((k) => k in args) && /could not find the function/i.test(error.message)) {
    const rest = Object.fromEntries(Object.entries(args).filter(([k]) => !optional.includes(k)));
    ({ data, error } = await supabase.rpc(fn, rest));
  }
  if (error) throw new Error(translateError(error.message));
  return data as T;
}

const shiftArgs = (night: string, slot: Slot) => ({ p_night: night, p_slot: slot });
/** Sent only when there is a note, so calls also work before the swap-notes migration is applied. */
const noteArg = (note?: string) => (note?.trim() ? { p_note: note.trim() } : {});

export const api = {
  rosterNames: () => call<RosterName[]>('roster_names'),
  claimName: (name: string) => call('claim_name', { p_name: name }),

  takeShift: (night: string, slot: Slot) => call('take_shift', shiftArgs(night, slot)),
  requestSwap: (night: string, slot: Slot, note?: string) =>
    call('request_swap', { ...shiftArgs(night, slot), ...noteArg(note) }),
  cancelSwapRequest: (night: string, slot: Slot) => call('cancel_swap_request', shiftArgs(night, slot)),
  offerSwap: (night: string, slot: Slot, note?: string) =>
    call<number>('offer_swap', { ...shiftArgs(night, slot), ...noteArg(note) }),
  withdrawOffer: (offerId: number) => call('withdraw_offer', { p_offer_id: offerId }),
  acceptOffer: (offerId: number) => call('accept_offer', { p_offer_id: offerId }),
  declineOffer: (offerId: number) => call('decline_offer', { p_offer_id: offerId }),
  sendSwapRequest: (night: string, slot: Slot, give: { night: string; slot: Slot } | null, note?: string) =>
    call<number>('send_swap_request', {
      ...shiftArgs(night, slot),
      p_give_night: give?.night ?? null,
      p_give_slot: give?.slot ?? null,
      ...noteArg(note),
    }),
  withdrawSwapRequest: (requestId: number) => call('withdraw_swap_request', { p_request_id: requestId }),
  acceptSwapRequest: (requestId: number) => call('accept_swap_request', { p_request_id: requestId }),
  declineSwapRequest: (requestId: number) => call('decline_swap_request', { p_request_id: requestId }),

  adminSetAssignee: (night: string, slot: Slot, name: string | null, updatePlan = false) =>
    call('admin_set_assignee', {
      ...shiftArgs(night, slot),
      p_name: name ?? '',
      ...(updatePlan ? { p_update_plan: true } : {}),
    }),
  adminSetPlan: (rows: { night: string; slot: Slot; name: string | null }[]) =>
    call<number>('admin_set_plan', { p_rows: rows }),
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
  setMyPhone: (phone: string) => call<string | null>('set_my_phone', { p_phone: phone }),
  adminContacts: () => call<AdminContact[]>('admin_contacts'),
  myCalendarToken: () => call<string>('my_calendar_token'),
  resetCalendarToken: () => call<string>('reset_calendar_token'),
};
