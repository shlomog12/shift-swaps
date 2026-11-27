import { addDays, israelToday } from './dates';
import { check } from './hooks';
import { supabase } from './supabase';
import {
  AUDIT_COLUMNS,
  OFFER_COLUMNS,
  PROFILE_COLUMNS,
  REQUEST_COLUMNS,
  SHIFT_COLUMNS,
  type AuditEntry,
  type Profile,
  type Shift,
  type Slot,
  type SwapOffer,
  type SwapRequest,
} from './types';

export async function loadShifts(from: string, to: string): Promise<Shift[]> {
  return check(
    await supabase
      .from('shifts')
      .select(SHIFT_COLUMNS)
      .gte('night', from)
      .lte('night', to)
      .order('night')
      .order('slot'),
  ) as Shift[];
}

/** Shifts from yesterday on (a shift dated today may still be ahead). */
export function loadUpcomingShifts(): Promise<Shift[]> {
  return loadShifts(addDays(israelToday(), -1), '9999-12-31');
}

export async function loadShift(night: string, slot: Slot): Promise<Shift | null> {
  return check(
    await supabase.from('shifts').select(SHIFT_COLUMNS).eq('night', night).eq('slot', slot).maybeSingle(),
  ) as Shift | null;
}

export async function loadPendingOffers(): Promise<SwapOffer[]> {
  return check(
    await supabase.from('swap_offers').select(OFFER_COLUMNS).eq('status', 'pending').order('created_at'),
  ) as SwapOffer[];
}

export async function loadShiftOffers(night: string, slot: Slot): Promise<SwapOffer[]> {
  return check(
    await supabase
      .from('swap_offers')
      .select(OFFER_COLUMNS)
      .eq('night', night)
      .eq('slot', slot)
      .order('created_at', { ascending: false })
      .limit(20),
  ) as SwapOffer[];
}

export async function loadMyOffers(userId: string): Promise<SwapOffer[]> {
  return check(
    await supabase
      .from('swap_offers')
      .select(OFFER_COLUMNS)
      .eq('volunteer_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ) as SwapOffer[];
}

export async function loadShiftRequests(night: string, slot: Slot): Promise<SwapRequest[]> {
  return check(
    await supabase
      .from('swap_requests')
      .select(REQUEST_COLUMNS)
      .eq('night', night)
      .eq('slot', slot)
      .order('created_at', { ascending: false })
      .limit(20),
  ) as SwapRequest[];
}

/** Pending requests for shifts that carry the given roster name. */
export async function loadIncomingRequests(name: string): Promise<SwapRequest[]> {
  return check(
    await supabase
      .from('swap_requests')
      .select(REQUEST_COLUMNS)
      .eq('status', 'pending')
      .eq('owner', name)
      .order('created_at'),
  ) as SwapRequest[];
}

export async function loadSentRequests(userId: string): Promise<SwapRequest[]> {
  return check(
    await supabase
      .from('swap_requests')
      .select(REQUEST_COLUMNS)
      .eq('requester_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ) as SwapRequest[];
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  return check(
    await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle(),
  ) as Profile | null;
}

export async function loadAudit(limit: number): Promise<AuditEntry[]> {
  return check(
    await supabase.from('audit_log').select(AUDIT_COLUMNS).order('at', { ascending: false }).limit(limit),
  ) as AuditEntry[];
}

const PAGE_ROWS = 1000;

/** Every shift, in pages (the server returns at most 1000 rows per request). */
export async function loadAllShifts(): Promise<Shift[]> {
  const all: Shift[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const page = check(
      await supabase
        .from('shifts')
        .select(SHIFT_COLUMNS)
        .order('night')
        .order('slot')
        .range(from, from + PAGE_ROWS - 1),
    ) as Shift[];
    all.push(...page);
    if (page.length < PAGE_ROWS) return all;
  }
}

/** The whole history, newest first, in pages. */
export async function loadAllAudit(): Promise<AuditEntry[]> {
  const all: AuditEntry[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const page = check(
      await supabase
        .from('audit_log')
        .select(AUDIT_COLUMNS)
        .order('at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + PAGE_ROWS - 1),
    ) as AuditEntry[];
    all.push(...page);
    if (page.length < PAGE_ROWS) return all;
  }
}
