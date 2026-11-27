import { paymentStage, type AuditEntry, type SwapPayment } from './types';

export interface PaymentBalance {
  name: string;
  /** Settled: paid to others / received from others. */
  paid: number;
  received: number;
  /** Still open: owed to others / owed by others. */
  owes: number;
  due: number;
}

/** Per person, money paid and received for swaps (cancelled payments left out), most money first. */
export function paymentBalances(payments: SwapPayment[], now = Date.now()): PaymentBalance[] {
  const rows = new Map<string, PaymentBalance>();
  const row = (name: string) => {
    const key = name.toLowerCase();
    if (!rows.has(key)) rows.set(key, { name, paid: 0, received: 0, owes: 0, due: 0 });
    return rows.get(key)!;
  };
  for (const p of payments) {
    if (p.cancelled_at) continue;
    const settled = paymentStage(p, now) === 'done';
    if (settled) {
      row(p.payer).paid += p.amount;
      row(p.payee).received += p.amount;
    } else {
      row(p.payer).owes += p.amount;
      row(p.payee).due += p.amount;
    }
  }
  const total = (r: PaymentBalance) => r.paid + r.received + r.owes + r.due;
  return [...rows.values()].sort((a, b) => total(b) - total(a) || a.name.localeCompare(b.name, 'he'));
}

export interface SwapBalance {
  name: string;
  /** Shifts handed to someone else. */
  given: number;
  /** Shifts taken from someone else. */
  taken: number;
  /** Open shifts taken. */
  open: number;
}

/**
 * Per person, shifts handed over and taken in swaps, from the history. An exchange counts both ways for both
 * sides. Most active first.
 */
export function swapBalances(entries: AuditEntry[]): SwapBalance[] {
  const rows = new Map<string, SwapBalance>();
  const row = (name: unknown) => {
    if (typeof name !== 'string' || !name) return null;
    const key = name.toLowerCase();
    if (!rows.has(key)) rows.set(key, { name, given: 0, taken: 0, open: 0 });
    return rows.get(key)!;
  };
  for (const e of entries) {
    const d = e.details ?? {};
    if (e.action === 'take') {
      const r = row(e.actor_name);
      if (r) r.open += 1;
      continue;
    }
    if (e.action !== 'swap' && e.action !== 'accept_swap_request') continue;
    const from = row(d.from);
    const to = row(d.to);
    if (from) from.given += 1;
    if (to) to.taken += 1;
    if (e.action === 'accept_swap_request' && d.give_night) {
      if (to) to.given += 1;
      if (from) from.taken += 1;
    }
  }
  const total = (r: SwapBalance) => r.given + r.taken + r.open;
  return [...rows.values()].sort((a, b) => total(b) - total(a) || a.name.localeCompare(b.name, 'he'));
}
