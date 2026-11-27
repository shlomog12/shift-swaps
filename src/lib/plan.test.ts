import { describe, expect, it } from 'vitest';
import { reconstructPlan } from './plan';
import type { AuditEntry, Shift } from './types';

const shift = (night: string, slot: 1 | 2, assignee: string | null): Shift => ({
  night,
  slot,
  assignee,
  swap_requested: false,
  updated_at: '',
});

let id = 0;
const ev = (at: string, action: string, night: string | null, slot: 1 | 2 | null, details: Record<string, unknown> = {}): AuditEntry => ({
  id: ++id,
  at,
  actor_id: null,
  actor_name: null,
  action,
  night,
  slot,
  details,
});

const plan = (shifts: Shift[], history: AuditEntry[]) =>
  Object.fromEntries(reconstructPlan(shifts, history).map((r) => [`${r.night}/${r.slot}`, r.name]));

describe('reconstructing the original roster', () => {
  it('undoes swaps and takes after the import', () => {
    const now = [shift('2026-12-01', 1, 'אבי'), shift('2026-12-01', 2, 'רון'), shift('2026-12-02', 1, 'רון')];
    const history = [
      ev('2026-11-01T10:00:00Z', 'import', null, null, { from: '2026-12-01', to: '2026-12-02' }),
      ev('2026-11-05T10:00:00Z', 'swap', '2026-12-01', 1, { from: 'דנה', to: 'אבי' }),
      ev('2026-11-06T10:00:00Z', 'take', '2026-12-01', 2),
      ev('2026-11-07T10:00:00Z', 'swap', '2026-12-02', 1, { from: 'יוסי', to: 'מיכל' }),
      ev('2026-11-08T10:00:00Z', 'swap', '2026-12-02', 1, { from: 'מיכל', to: 'רון' }),
    ];
    expect(plan(now, history)).toEqual({ '2026-12-01/1': 'דנה', '2026-12-01/2': null, '2026-12-02/1': 'יוסי' });
  });

  it('undoes both shifts of an exchange', () => {
    const now = [shift('2026-12-01', 1, 'אבי'), shift('2026-12-05', 2, 'דנה')];
    const history = [
      ev('2026-11-05T10:00:00Z', 'accept_swap_request', '2026-12-01', 1, {
        from: 'דנה',
        to: 'אבי',
        give_night: '2026-12-05',
        give_slot: 2,
      }),
    ];
    expect(plan(now, history)).toEqual({ '2026-12-01/1': 'דנה', '2026-12-05/2': 'אבי' });
  });

  it('keeps admin edits as planned, unless marked one-off', () => {
    const now = [shift('2026-12-01', 1, 'רון'), shift('2026-12-01', 2, 'אבי')];
    const history = [
      ev('2026-11-01T10:00:00Z', 'admin_set', '2026-12-01', 1, { from: 'דנה', to: 'רון' }),
      ev('2026-11-02T10:00:00Z', 'admin_set', '2026-12-01', 2, { from: 'יוסי', to: 'אבי', plan: false }),
    ];
    expect(plan(now, history)).toEqual({ '2026-12-01/1': 'רון', '2026-12-01/2': 'יוסי' });
  });

  it('ignores swaps from before the last import of that night', () => {
    const now = [shift('2026-12-01', 1, 'אבי')];
    const history = [
      ev('2026-10-01T10:00:00Z', 'swap', '2026-12-01', 1, { from: 'ישן', to: 'משהו' }),
      ev('2026-11-01T10:00:00Z', 'import', null, null, { from: '2026-12-01', to: '2026-12-31' }),
      ev('2026-11-05T10:00:00Z', 'swap', '2026-12-01', 1, { from: 'דנה', to: 'אבי' }),
    ];
    expect(plan(now, history)).toEqual({ '2026-12-01/1': 'דנה' });
  });

  it('carries renames into the original', () => {
    const now = [shift('2026-12-01', 1, 'אבי')];
    const history = [
      ev('2026-11-02T10:00:00Z', 'swap', '2026-12-01', 1, { from: 'דני', to: 'אבי' }),
      ev('2026-11-03T10:00:00Z', 'admin_rename_user', null, null, { from: 'דני', to: 'דני כהן', shifts_renamed: true }),
    ];
    expect(plan(now, history)).toEqual({ '2026-12-01/1': 'דני כהן' });
  });
});
