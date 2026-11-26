import { addDays, israelToday } from './dates';
import { check } from './hooks';
import { supabase } from './supabase';
import {
  AUDIT_COLUMNS,
  OFFER_COLUMNS,
  PROFILE_COLUMNS,
  SHIFT_COLUMNS,
  type AuditEntry,
  type Profile,
  type Shift,
  type Slot,
  type SwapOffer,
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
