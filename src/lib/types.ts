export type Slot = 1 | 2;

export interface Shift {
  night: string; // YYYY-MM-DD, the date on which the shift hours fall
  slot: Slot;
  assignee: string | null;
  swap_requested: boolean;
  /** Optional note on the swap request (missing until the swap-notes migration is applied). */
  swap_note?: string | null;
  /** Amount offered to whoever takes the shift (missing until the paid-swaps migration is applied). */
  swap_price?: number | null;
  /** Who the admin planned for the shift (missing until the planned-roster migration is applied). */
  planned_assignee?: string | null;
  /** Only in the original-roster view, where `assignee` shows the original: who does the shift now. */
  actual?: string | null;
  updated_at: string;
}

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface SwapOffer {
  id: number;
  night: string;
  slot: Slot;
  requester: string;
  volunteer_id: string;
  volunteer: string;
  status: OfferStatus;
  note?: string | null;
  price?: number | null;
  created_at: string;
  decided_at: string | null;
}

/** A direct request for someone's shift, optionally offering one of the requester's shifts in exchange. */
export interface SwapRequest {
  id: number;
  night: string;
  slot: Slot;
  owner: string;
  requester_id: string;
  requester: string;
  give_night: string | null;
  give_slot: Slot | null;
  note?: string | null;
  /** "I'll take your shift for ₪X": what the owner pays the requester if accepted. */
  price?: number | null;
  status: OfferStatus;
  created_at: string;
  decided_at: string | null;
}

export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  display_name: string | null;
  is_admin: boolean;
  status: UserStatus;
  created_at: string;
}

export interface AdminUser extends Profile {
  email: string;
  google_name: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  night: string | null;
  slot: Slot | null;
  details: Record<string, unknown>;
  /** The admin who did it on the actor's behalf (missing until the act-as migration is applied). */
  by_id?: string | null;
  by_name?: string | null;
}

/** An admin who added a phone, for WhatsApp messages from users waiting for approval. */
export interface AdminContact {
  id: string;
  name: string;
  phone: string;
}

export interface RosterName {
  name: string;
  claimed: boolean;
}

export interface ShiftKey {
  night: string;
  slot: Slot;
}

// All columns of these tables are readable; '*' keeps the app working whether or not a migration that adds
// a column (such as the swap notes) has been applied yet.
export const SHIFT_COLUMNS = '*';
export const REQUEST_COLUMNS = '*';
export const OFFER_COLUMNS = '*';
export const PROFILE_COLUMNS = 'id,display_name,is_admin,status,created_at';
export const AUDIT_COLUMNS = 'id,at,actor_id,actor_name,action,night,slot,details';
/** With who acted on the actor's behalf; needs the act-as migration. */
export const AUDIT_COLUMNS_WITH_BY = `${AUDIT_COLUMNS},by_id,by_name`;

/** How an admin account without a roster name is shown: a system manager, not one of the guards. */
export const SYSTEM_ADMIN_LABEL = 'אחראי מערכת';

/** Money owed for an accepted paid swap: whoever handed over the shift pays whoever took it. */
export interface SwapPayment {
  id: number;
  night: string;
  slot: Slot;
  payer: string;
  payer_id: string | null;
  payee: string;
  payee_id: string | null;
  amount: number;
  source: 'offer' | 'request';
  created_at: string;
  paid_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
}

export const DEFAULT_SWAP_PRICE = 250;
export const MAX_SWAP_PRICE = 500;

export const MIN_SWAP_PRICE = 10;
/** Quick picks next to the amount field. */
export const PRICE_PRESETS = [100, 200, 250, 300];

/** A payment marked paid and not answered by the payee for this long counts as settled. */
export const PAYMENT_CONFIRM_DAYS = 7;

/**
 * Where a payment stands: waiting to be paid, marked paid and waiting for the payee to confirm, or done
 * (received, cancelled, or marked paid and not answered for PAYMENT_CONFIRM_DAYS).
 */
export type PaymentStage = 'unpaid' | 'awaiting' | 'done';

export function paymentStage(p: SwapPayment, now = Date.now()): PaymentStage {
  if (p.cancelled_at || p.received_at) return 'done';
  if (!p.paid_at) return 'unpaid';
  return now - Date.parse(p.paid_at) > PAYMENT_CONFIRM_DAYS * 86_400_000 ? 'done' : 'awaiting';
}

/** Not settled yet: waiting to be paid, or paid and waiting for the payee. */
export function paymentOpen(p: SwapPayment): boolean {
  return paymentStage(p) !== 'done';
}

/** Whether the payment waits for me: I owe it and have not paid, or I am owed it and it was marked paid. */
export function paymentNeedsMe(p: SwapPayment, iPay: boolean): boolean {
  const stage = paymentStage(p);
  return iPay ? stage === 'unpaid' : stage === 'awaiting';
}

/** An entry in the in-app inbox: the same notices that go out as phone notifications. */
export interface AppNotification {
  id: number;
  title: string;
  body: string;
  /** e.g. "./?shift=2026-12-03_1" when it is about a shift. */
  url: string | null;
  created_at: string;
  read_at: string | null;
}
