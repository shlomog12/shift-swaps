import { describe, expect, it } from 'vitest';
import { dayHeading, historyCategory, involvesMe, israelDay } from './historyView';
import type { AuditEntry } from './types';

const entry = (actor_id: string | null, details: Record<string, unknown>): AuditEntry => ({
  id: 1,
  at: '2026-11-26T10:00:00Z',
  actor_id,
  actor_name: null,
  action: 'swap',
  night: null,
  slot: null,
  details,
});

describe('history view', () => {
  it('uses the Israel date', () => {
    expect(israelDay('2026-11-26T22:30:00Z')).toBe('2026-11-27'); // 00:30 in Israel
  });

  it('names the day', () => {
    expect(dayHeading('2026-11-27', '2026-11-27')).toBe('היום');
    expect(dayHeading('2026-11-26', '2026-11-27')).toBe('אתמול');
    expect(dayHeading('2026-11-24', '2026-11-27')).toContain('יום שלישי');
  });

  it('sorts actions into filters', () => {
    expect(historyCategory('offer')).toBe('swaps');
    expect(historyCategory('take')).toBe('shifts');
    expect(historyCategory('approve_user')).toBe('users');
  });

  it('finds what involves me', () => {
    expect(involvesMe(entry('me', {}), 'me', 'דנה')).toBe(true);
    expect(involvesMe(entry('x', { from: 'דנה', to: 'אבי' }), 'me', 'דנה')).toBe(true);
    expect(involvesMe(entry('x', { from: 'יוסי', to: 'אבי' }), 'me', 'דנה')).toBe(false);
    expect(involvesMe(entry('x', { note: 'דנה' }), 'me', 'דנה')).toBe(false);
  });
});
