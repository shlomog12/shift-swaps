import { useState } from 'react';
import { api } from '../lib/api';
import { formatDate, formatDateTime, hasStarted, slotTime } from '../lib/dates';
import { useAction, useMe, useQuery } from '../lib/hooks';
import { loadUpcomingShifts } from '../lib/queries';
import type { OfferStatus, ShiftKey, SwapRequest } from '../lib/types';

export const REQUEST_STATUS: Record<OfferStatus, string> = {
  pending: 'ממתין לתשובה',
  accepted: 'אושר',
  declined: 'לא אושר',
  cancelled: 'בוטל',
};

export function shiftText(night: string, slot: 1 | 2): string {
  return `${formatDate(night)} · ${slotTime(night, slot)}`;
}

/** What the requester offers back: one of their shifts, or nothing. */
export function giveText(r: SwapRequest): string {
  return r.give_night && r.give_slot ? `בתמורה ל־${shiftText(r.give_night, r.give_slot)}` : 'בלי משמרת בתמורה';
}

const NOTHING = 'nothing';

/** Lets a user ask the owner of a shift for it, offering one of their own shifts or nothing in return. */
export function RequestForm({ target, owner, onDone }: { target: ShiftKey; owner: string; onDone: () => void }) {
  const me = useMe();
  const shifts = useQuery(loadUpcomingShifts, []);
  const [choice, setChoice] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const mine = (shifts.data ?? []).filter((s) => me.isMine(s.assignee) && !hasStarted(s.night, s.slot));

  function send() {
    if (!choice) return;
    const give = choice === NOTHING ? null : mine.find((s) => `${s.night}/${s.slot}` === choice) ?? null;
    run(() => api.sendSwapRequest(target.night, target.slot, give && { night: give.night, slot: give.slot }), onDone);
  }

  return (
    <section className="request-form">
      <h3>בקשת חילוף מ{owner}</h3>
      <p className="muted small">{owner} יקבל/תקבל מייל ויוכל/תוכל לאשר או לדחות. מה תיתן/תתני בתמורה?</p>
      {shifts.loading && !shifts.data && <p className="muted">טוען...</p>}
      <div className="choices">
        {mine.map((s) => {
          const key = `${s.night}/${s.slot}`;
          return (
            <label key={key} className="choice">
              <input type="radio" name="give" checked={choice === key} onChange={() => setChoice(key)} />
              <span>המשמרת שלי ב־{shiftText(s.night, s.slot)}</span>
            </label>
          );
        })}
        <label className="choice">
          <input type="radio" name="give" checked={choice === NOTHING} onChange={() => setChoice(NOTHING)} />
          <span>בלי תמורה, רק לקחת את המשמרת</span>
        </label>
      </div>
      <div className="row">
        <button className="primary" disabled={busy || !choice} onClick={send}>
          שליחת הבקשה
        </button>
        <button disabled={busy} onClick={onDone}>
          ביטול
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

/** A pending request addressed to the shift's owner, with accept and decline buttons. */
export function IncomingRequest({ request: r, showShift }: { request: SwapRequest; showShift?: boolean }) {
  const me = useMe();
  const { busy, error, run } = useAction();

  function accept() {
    const message =
      r.give_night && r.give_slot
        ? `להחליף עם ${r.requester}? המשמרת ב־${shiftText(r.night, r.slot)} תעבור אליו/ה, ` +
          `ואת/ה תקבל/י את המשמרת ב־${shiftText(r.give_night, r.give_slot)}.`
        : `למסור ל${r.requester} את המשמרת ב־${shiftText(r.night, r.slot)}, בלי משמרת בתמורה?`;
    if (window.confirm(message)) run(() => api.acceptSwapRequest(r.id));
  }

  return (
    <li className="request-item">
      <span className="list-main">
        {showShift ? (
          <button className="link" onClick={() => me.openShift(r.night, r.slot)}>
            <strong>{shiftText(r.night, r.slot)}</strong>
          </button>
        ) : null}
        <span>
          <strong>{r.requester}</strong> · {giveText(r)}
        </span>
        <span className="muted small">{formatDateTime(r.created_at)}</span>
        {error && <span className="error small">{error}</span>}
      </span>
      <span className="row">
        <button className="primary small" disabled={busy} onClick={accept}>
          אישור
        </button>
        <button className="small" disabled={busy} onClick={() => run(() => api.declineSwapRequest(r.id))}>
          דחייה
        </button>
      </span>
    </li>
  );
}
