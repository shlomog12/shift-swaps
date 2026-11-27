import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile, Shift, Slot, SwapOffer, SwapPayment, SwapRequest } from './types';

/** Bumped whenever shared data may have changed, so every query reloads. */
export const RefreshContext = createContext<{ version: number; refresh: () => void }>({
  version: 0,
  refresh: () => {},
});

export function useRefresh() {
  return useContext(RefreshContext);
}

export interface QueryState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

/** Runs `load` on mount, whenever `deps` change and whenever the shared data version changes. */
export function useQuery<T>(load: () => Promise<T>, deps: unknown[]): QueryState<T> {
  const { version } = useRefresh();
  const [state, setState] = useState<QueryState<T>>({ data: undefined, error: null, loading: true });
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setState((prev) => ({ ...prev, loading: true }));
    load().then(
      (data) => id === request.current && setState({ data, error: null, loading: false }),
      (error: Error) => id === request.current && setState((prev) => ({ ...prev, error: error.message, loading: false })),
    );
  }, [...deps, version]);

  return state;
}

/** Throws a readable error for a failed table query. */
export function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export function useSession(): { session: Session | null; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return { session, ready };
}

/** Reloads data when the database changes (Supabase Realtime) or when the app comes back into view. */
export function useLiveRefresh(enabled: boolean, refresh: () => void) {
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const debounced = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 300);
    };
    const channel = supabase
      .channel('roster-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swap_offers' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swap_requests' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swap_payments' }, debounced)
      .subscribe();
    const onVisible = () => document.visibilityState === 'visible' && debounced();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);
}

/** Context with the signed-in user's profile and helpers used across screens. */
export interface Me {
  profile: Profile;
  email: string;
  isMine: (assignee: string | null) => boolean;
  openShift: (night: string, slot: Slot) => void;
  /** Set while an admin views a roster name nobody has claimed yet: everything is shown, nothing can be done. */
  readOnly: string | null;
}

export const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe must be used inside MeContext');
  return me;
}

/** Upcoming shifts and pending offers, loaded once in the shell and shared by every screen. */
export interface Roster {
  upcoming: QueryState<Shift[]>;
  pendingOffers: QueryState<SwapOffer[]>;
  /** Pending direct requests addressed to my roster name. */
  incoming: QueryState<SwapRequest[]>;
  /** Payments I owe or am owed (empty until the paid-swaps migration is applied). */
  payments: QueryState<SwapPayment[]>;
}

export const RosterContext = createContext<Roster | null>(null);

export function useRoster(): Roster {
  const roster = useContext(RosterContext);
  if (!roster) throw new Error('useRoster must be used inside RosterContext');
  return roster;
}

export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/** Wraps an async action with busy and error state. */
export function useAction() {
  const { refresh } = useRefresh();
  const readOnly = useContext(MeContext)?.readOnly ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (action: () => Promise<unknown>, onDone?: () => void) => {
      // There is no user to act for: any call would run as the admin, so block them all.
      if (readOnly) {
        setError(`${readOnly} עוד לא באפליקציה, אז אפשר רק לצפות. כדי לשבץ אותו צריך לצאת ולערוך כמנהל.`);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await action();
        onDone?.();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [refresh, readOnly],
  );

  return { busy, error, setError, run };
}
