import { useState } from 'react';
import { api } from '../lib/api';
import { formatDate, formatDateTime, hasStarted, nightLabel, slotTime } from '../lib/dates';
import { useAction, useMe, useRoster } from '../lib/hooks';
import { shiftLink, whatsappUrl } from '../lib/share';
import type { OfferStatus, Shift, ShiftKey, SwapRequest } from '../lib/types';
import { useFeedback } from './Feedback';

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

/** Opens WhatsApp with a ready message; the person picks the chat. */
export function WhatsAppButton({ text, label = 'שיתוף בוואטסאפ' }: { text: string; label?: string }) {
  return (
    <a className="button whatsapp" href={whatsappUrl(text)} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

/** Message for a group: someone is looking for a replacement; the link opens the shift to volunteer. */
export function swapWantedText(shift: Shift, mine: boolean): string {
  const whom = mine ? 'אותי' : `את ${shift.assignee}`;
  return (
    `מישהו יכול להחליף ${whom} במשמרת ב־${shiftText(shift.night, shift.slot)} (${nightLabel(shift.night)})?\n` +
    `אפשר להתנדב כאן:\n${shiftLink(shift.night, shift.slot)}`
  );
}

/** Message to the owner about a direct request; the link opens the shift with accept and decline. */
export function requestSentText(r: SwapRequest): string {
  const offer =
    r.give_night && r.give_slot
      ? `להחליף איתך: לקחת את המשמרת שלך ב־${shiftText(r.night, r.slot)}, ` +
        `ובתמורה לתת לך את המשמרת שלי ב־${shiftText(r.give_night, r.give_slot)}`
      : `לקחת ממך את המשמרת ב־${shiftText(r.night, r.slot)}, בלי משמרת בתמורה`;
  return `היי ${r.owner}, ביקשתי באפליקציית המשמרות ${offer}.\nאפשר לאשר כאן:\n${shiftLink(r.night, r.slot)}`;
}

const NOTHING = 'nothing';

/** Lets a user ask the owner of a shift for it, offering one of their own shifts or nothing in return. */
export function RequestForm({ target, owner, onDone }: { target: ShiftKey; owner: string; onDone: () => void }) {
  const me = useMe();
  const shifts = useRoster().upcoming;
  const [choice, setChoice] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const { toast } = useFeedback();
  const mine = (shifts.data ?? []).filter((s) => me.isMine(s.assignee) && !hasStarted(s.night, s.slot));

  function send() {
    if (!choice) return;
    const give = choice === NOTHING ? null : mine.find((s) => `${s.night}/${s.slot}` === choice) ?? null;
    run(
      () => api.sendSwapRequest(target.night, target.slot, give && { night: give.night, slot: give.slot }),
      () => {
        toast(`הבקשה נשלחה ל${owner}`);
        onDone();
      },
    );
  }

  return (
    <section className="request-form">
      <h3>בקשת חילוף מ{owner}</h3>
      <p className="muted small">תישלח הודעה במייל ל{owner}, ואפשר יהיה לאשר או לדחות. מה בתמורה?</p>
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
  const { confirm, toast } = useFeedback();
  const exchange = Boolean(r.give_night && r.give_slot);

  async function accept() {
    const ok = await confirm({
      title: exchange ? `להחליף עם ${r.requester}?` : `למסור את המשמרת ל${r.requester}?`,
      message: (
        <>
          <p>
            המשמרת ב־{shiftText(r.night, r.slot)} תעבור ל{r.requester}.
          </p>
          {r.give_night && r.give_slot ? (
            <p>בתמורה, המשמרת ב־{shiftText(r.give_night, r.give_slot)} תעבור אליך.</p>
          ) : (
            <p className="muted">בלי משמרת בתמורה.</p>
          )}
        </>
      ),
      confirmLabel: exchange ? 'אישור ההחלפה' : 'מסירת המשמרת',
    });
    if (ok) run(() => api.acceptSwapRequest(r.id), () => toast(exchange ? 'ההחלפה אושרה' : `המשמרת נמסרה ל${r.requester}`));
  }

  async function decline() {
    const ok = await confirm({ title: `לדחות את הבקשה של ${r.requester}?`, confirmLabel: 'דחייה', danger: true });
    if (ok) run(() => api.declineSwapRequest(r.id), () => toast('הבקשה נדחתה'));
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
        <button className="small" disabled={busy} onClick={decline}>
          דחייה
        </button>
      </span>
    </li>
  );
}
