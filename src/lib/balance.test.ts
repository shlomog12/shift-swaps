import { describe, expect, it } from 'vitest';
import { paymentBalances, swapBalances } from './balance';
import type { AuditEntry, SwapPayment } from './types';

const pay = (over: Partial<SwapPayment>): SwapPayment => ({
  id: 1,
  night: '2026-12-01',
  slot: 1,
  payer: 'א',
  payer_id: null,
  payee: 'ב',
  payee_id: null,
  amount: 100,
  source: 'offer',
  created_at: '2026-11-20T10:00:00Z',
  paid_at: null,
  received_at: null,
  cancelled_at: null,
  ...over,
});

const entry = (action: string, details: Record<string, unknown>, actor = 'x'): AuditEntry => ({
  id: 1,
  at: '2026-11-20T10:00:00Z',
  actor_id: null,
  actor_name: actor,
  action,
  night: '2026-12-01',
  slot: 1,
  details,
});

describe('paymentBalances', () => {
  it('splits settled from open and leaves cancelled out', () => {
    const rows = paymentBalances(
      [
        pay({ amount: 250, received_at: '2026-11-21T10:00:00Z' }),
        pay({ amount: 100 }),
        pay({ amount: 999, cancelled_at: '2026-11-21T10:00:00Z' }),
      ],
      Date.parse('2026-11-27T10:00:00Z'),
    );
    expect(rows.find((r) => r.name === 'א')).toEqual({ name: 'א', paid: 250, received: 0, owes: 100, due: 0 });
    expect(rows.find((r) => r.name === 'ב')).toEqual({ name: 'ב', paid: 0, received: 250, owes: 0, due: 100 });
  });
});

describe('swapBalances', () => {
  it('counts hand-overs, exchanges both ways, and open shifts taken', () => {
    const rows = swapBalances([
      entry('swap', { from: 'דני', to: 'רון' }),
      entry('accept_swap_request', { from: 'דני', to: 'רון', give_night: '2026-12-05' }),
      entry('take', {}, 'רון'),
    ]);
    expect(rows.find((r) => r.name === 'דני')).toEqual({ name: 'דני', given: 2, taken: 1, open: 0 });
    expect(rows.find((r) => r.name === 'רון')).toEqual({ name: 'רון', given: 1, taken: 2, open: 1 });
  });
});
