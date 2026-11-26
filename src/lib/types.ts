export type Slot = 1 | 2;

export interface Shift {
  night: string; // YYYY-MM-DD, the date on which the shift hours fall
  slot: Slot;
  assignee: string | null;
  swap_requested: boolean;
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

export const SHIFT_COLUMNS = 'night,slot,assignee,swap_requested,updated_at';
export const REQUEST_COLUMNS =
  'id,night,slot,owner,requester_id,requester,give_night,give_slot,status,created_at,decided_at';
export const OFFER_COLUMNS = 'id,night,slot,requester,volunteer_id,volunteer,status,created_at,decided_at';
export const PROFILE_COLUMNS = 'id,display_name,is_admin,status,created_at';
export const AUDIT_COLUMNS = 'id,at,actor_id,actor_name,action,night,slot,details';
