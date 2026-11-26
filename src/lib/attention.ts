import { hasStarted } from './dates';
import type { Shift, SwapOffer } from './types';

export interface Decision {
  shift: Shift;
  volunteers: string[];
}

const key = (s: { night: string; slot: number }) => `${s.night}/${s.slot}`;

/** My upcoming shifts that have a swap request with volunteers waiting for my answer. */
export function awaitingMyDecision(
  shifts: Shift[],
  offers: SwapOffer[],
  isMine: (assignee: string | null) => boolean,
  now: Date = new Date(),
): Decision[] {
  const volunteers = new Map<string, string[]>();
  for (const o of offers) {
    if (o.status !== 'pending') continue;
    volunteers.set(key(o), [...(volunteers.get(key(o)) ?? []), o.volunteer]);
  }
  return shifts
    .filter((s) => s.swap_requested && isMine(s.assignee) && !hasStarted(s.night, s.slot, now))
    .map((s) => ({ shift: s, volunteers: volunteers.get(key(s)) ?? [] }))
    .filter((d) => d.volunteers.length > 0);
}

/** My first shift that has not started yet. Expects shifts sorted by night and slot. */
export function nextShift(
  shifts: Shift[],
  isMine: (assignee: string | null) => boolean,
  now: Date = new Date(),
): Shift | undefined {
  return shifts.find((s) => isMine(s.assignee) && !hasStarted(s.night, s.slot, now));
}
