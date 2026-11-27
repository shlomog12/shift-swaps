import type { AuditEntry, Shift } from './types';

const key = (night: string, slot: number) => `${night}/${slot}`;
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export interface PlanRow {
  night: string;
  slot: 1 | 2;
  name: string | null;
}

/**
 * Rebuilds the original roster (what the admin planned) from the current roster and the history: walking
 * back from the newest action, it undoes every take, swap and accepted swap offer, until it reaches the
 * point where the admin set that shift (an import, building nights, deleting nights, or an admin edit that
 * was not marked as a one-off). Renames of people with their shifts carry through to the result.
 * `history` may be in any order.
 */
export function reconstructPlan(shifts: Shift[], history: AuditEntry[]): PlanRow[] {
  const state = new Map(shifts.map((s) => [key(s.night, s.slot), s.assignee]));
  const frozen = new Set<string>();
  const renames: { from: string; to: string }[] = []; // newest first

  // Names written by older actions are carried forward through the renames that happened after them.
  const resolve = (name: string | null) => {
    let out = name;
    for (let i = renames.length - 1; i >= 0; i--) {
      if (out && out.toLowerCase() === renames[i].from.toLowerCase()) out = renames[i].to;
    }
    return out;
  };
  const undo = (k: string, before: string | null) => {
    if (!frozen.has(k) && state.has(k)) state.set(k, resolve(before));
  };
  const freezeRange = (from: unknown, to: unknown) => {
    const a = str(from);
    const b = str(to);
    if (!a || !b) return;
    for (const k of state.keys()) {
      const night = k.slice(0, 10);
      if (night >= a && night <= b) frozen.add(k);
    }
  };

  const newestFirst = [...history].sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
  for (const e of newestFirst) {
    const d = e.details ?? {};
    const k = e.night && e.slot ? key(e.night, e.slot) : null;
    switch (e.action) {
      case 'take':
        if (k) undo(k, null);
        break;
      case 'swap':
        if (k) undo(k, str(d.from));
        break;
      case 'accept_swap_request':
        if (k) undo(k, str(d.from));
        if (str(d.give_night) && d.give_slot) undo(key(String(d.give_night), Number(d.give_slot)), str(d.to));
        break;
      case 'admin_set':
        if (!k) break;
        // Marked a one-off (plan: false): a change to the current roster only, so undo it like a swap.
        if (d.plan === false) undo(k, str(d.from));
        else frozen.add(k);
        break;
      case 'admin_set_plan':
        if (k) frozen.add(k);
        break;
      case 'import':
      case 'add_nights':
      case 'delete_nights':
        freezeRange(d.from, d.to);
        break;
      case 'admin_rename_user':
        if (d.shifts_renamed && str(d.from) && str(d.to)) renames.push({ from: String(d.from), to: String(d.to) });
        break;
    }
  }

  return shifts.map((s) => ({ night: s.night, slot: s.slot, name: state.get(key(s.night, s.slot)) ?? null }));
}

/** The shift as the original roster shows it: the planned name, and who does it now in `actual`. */
export function asPlanned(s: Shift): Shift {
  return { ...s, assignee: s.planned_assignee ?? null, actual: s.assignee, swap_requested: false };
}

/** In the original view: whether someone else does the shift now. */
export function differsFromPlan(s: Shift): boolean {
  return s.actual !== undefined && (s.actual ?? null) !== (s.assignee ?? null);
}
