import { describe, expect, it } from 'vitest';
import { paymentNeedsMe, paymentStage, type SwapPayment } from './types';

const base: SwapPayment = {
  id: 1,
  night: '2026-12-01',
  slot: 1,
  payer: 'א',
  payer_id: 'a',
  payee: 'ב',
  payee_id: 'b',
  amount: 250,
  source: 'offer',
  created_at: '2026-11-20T10:00:00Z',
  paid_at: null,
  received_at: null,
  cancelled_at: null,
};
const now = Date.parse('2026-11-27T12:00:00Z');

describe('paymentStage', () => {
  it('waits to be paid, then for the payee, then is done', () => {
    expect(paymentStage(base, now)).toBe('unpaid');
    expect(paymentStage({ ...base, paid_at: '2026-11-26T10:00:00Z' }, now)).toBe('awaiting');
    expect(paymentStage({ ...base, paid_at: '2026-11-26T10:00:00Z', received_at: '2026-11-27T10:00:00Z' }, now)).toBe('done');
    expect(paymentStage({ ...base, cancelled_at: '2026-11-27T10:00:00Z' }, now)).toBe('done');
  });

  it('closes a payment marked paid and not answered for 7 days', () => {
    expect(paymentStage({ ...base, paid_at: '2026-11-19T10:00:00Z' }, now)).toBe('done');
  });
});

describe('paymentNeedsMe', () => {
  it('asks the payer to pay and the payee to confirm', () => {
    const paid = { ...base, paid_at: new Date().toISOString() };
    expect(paymentNeedsMe(base, true)).toBe(true);
    expect(paymentNeedsMe(base, false)).toBe(false);
    expect(paymentNeedsMe(paid, true)).toBe(false);
    expect(paymentNeedsMe(paid, false)).toBe(true);
  });
});
