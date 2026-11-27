import { useSyncExternalStore } from 'react';

const KEY = 'hebrew-dates';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => localStorage.getItem(KEY) === 'on';

/** Whether to show Hebrew dates next to the Gregorian ones; shared by the calendar and the profile. */
export function useHebrewDates(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read);
  function set(next: boolean) {
    localStorage.setItem(KEY, next ? 'on' : 'off');
    listeners.forEach((l) => l());
  }
  return [on, set];
}
