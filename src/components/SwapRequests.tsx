import { useState } from 'react';
import { api } from '../lib/api';
import { addDays, formatDate, formatDateTime, hasStarted, israelToday, nightLabel, slotTime } from '../lib/dates';
import { useAction, useMe, usePhoneOf, useRoster } from '../lib/hooks';
import { appLink, shiftLink, whatsappUrl } from '../lib/share';
import type { OfferStatus, Shift, ShiftKey, SwapRequest } from '../lib/types';
import { useIsRegistered } from '../lib/registered';
import { useFeedback } from './Feedback';
import { NoteLine } from './NoteLine';
import { PriceField, priceInvalid } from './PaidSwap';
import { WhatsAppIcon } from './WhatsAppIcon';
import { SkeletonList } from './Skeleton';

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
  if (r.give_night && r.give_slot) return `בתמורה ל־${shiftText(r.give_night, r.give_slot)}`;
  return r.price ? `תמורת ₪${r.price}` : 'בלי משמרת בתמורה';
}

/**
 * Opens WhatsApp with a ready message: straight to the chat of `phone`, or of `to` (a roster name) if they
 * added a phone; otherwise the person picks the chat.
 */
export function WhatsAppButton({
  text,
  label = 'שיתוף בוואטסאפ',
  phone,
  to,
  className = '',
}: {
  text: string;
  label?: string;
  phone?: string | null;
  to?: string | null;
  className?: string;
}) {
  const phoneOf = usePhoneOf();
  return (
    <a
      className={`button whatsapp ${className}`.trim()}
      href={whatsappUrl(text, phone ?? phoneOf(to))}
      target="_blank"
      rel="noopener noreferrer"
    >
      <WhatsAppIcon />
      {label}
    </a>
  );
}

/** Message for a group: someone is looking for a replacement; the link opens the shift to volunteer. */
export function swapWantedText(shift: Shift, mine: boolean): string {
  const whom = mine ? 'אותי' : `את ${shift.assignee}`;
  return (
    `מישהו יכול להחליף ${whom} במשמרת ב־${shiftText(shift.night, shift.slot)} (${nightLabel(shift.night)})?\n` +
    (shift.swap_note ? `"${shift.swap_note}"\n` : '') +
    (shift.swap_price ? `תמורת ₪${shift.swap_price}.\n` : '') +
    `אפשר להתנדב כאן:\n${shiftLink(shift.night, shift.slot)}`
  );
}

/** Message to the owner about a direct request; the link opens the shift with accept and decline. */
export function requestSentText(r: SwapRequest, registered = true): string {
  const offer =
    r.give_night && r.give_slot
      ? `להחליף איתך: לקחת את המשמרת שלך ב־${shiftText(r.night, r.slot)}, ` +
        `ובתמורה לתת לך את המשמרת שלי ב־${shiftText(r.give_night, r.give_slot)}`
      : `לקחת ממך את המשמרת ב־${shiftText(r.night, r.slot)}, ${r.price ? `תמורת ₪${r.price}` : 'בלי משמרת בתמורה'}`;
  const note = r.note?.trim() ? `\n${r.note.trim()}` : '';
  const join = registered ? '' : `\n${JOIN_LINE.trim()}`;
  return `היי ${r.owner}, שלחתי לך הצעה באפליקציית המשמרות ${offer}.${note}${join}\nאפשר לאשר כאן:\n${shiftLink(r.night, r.slot)}`;
}

/** To the owner after volunteering; the link opens the shift with the approve button. */
/** Added to a message for someone who has not joined the app yet, so they know how to approve. */
const JOIN_LINE = 'כדי לאשר צריך להיכנס לאפליקציה עם חשבון גוגל ולבחור את השם שלך ברשימה.\n';

export function volunteeredText(shift: Shift, note?: string | null, registered = true): string {
  return (
    `היי ${shift.assignee}, התנדבתי באפליקציית המשמרות לקחת את המשמרת שלך ב־${shiftText(shift.night, shift.slot)}.\n` +
    (note?.trim() ? `${note.trim()}\n` : '') +
    (registered ? '' : JOIN_LINE) +
    `אפשר לאשר כאן:\n${shiftLink(shift.night, shift.slot)}`
  );
}

/** To a volunteer after the owner decided. */
export function offerDecisionText(shift: Shift, volunteer: string, accepted: boolean): string {
  const when = shiftText(shift.night, shift.slot);
  return accepted
    ? `היי ${volunteer}, ההתנדבות שלך אושרה. המשמרת ב־${when} רשומה עכשיו עליך. תודה!\n${shiftLink(shift.night, shift.slot)}`
    : `היי ${volunteer}, תודה על ההתנדבות למשמרת ב־${when}. בסוף היא לא אושרה.`;
}

/** To the requester after the owner decided on a direct request. */
export function requestDecisionText(r: SwapRequest, accepted: boolean): string {
  const when = shiftText(r.night, r.slot);
  if (!accepted) return `היי ${r.requester}, הצעת ההחלפה שלך על המשמרת ב־${when} לא אושרה.`;
  const back =
    r.give_night && r.give_slot ? `, והמשמרת שלך ב־${shiftText(r.give_night, r.give_slot)} עברה ל${r.owner}` : '';
  return `היי ${r.requester}, הצעת ההחלפה אושרה. המשמרת ב־${when} רשומה עכשיו עליך${back}.\n${shiftLink(r.night, r.slot)}`;
}

/** For a group: every open swap request, each with a link to volunteer. */
export function openSwapsText(shifts: Shift[]): string {
  const lines = shifts.map(
    (s) =>
      `• ${shiftText(s.night, s.slot)} – ${s.assignee}${s.swap_price ? ` (₪${s.swap_price})` : ''}\n  ${shiftLink(s.night, s.slot)}`,
  );
  return `מחפשים מחליפים למשמרות האלה. מי שיכול, אפשר להתנדב בקישור:\n\n${lines.join('\n')}`;
}

/** Invitation to people who have not joined yet. */
export function inviteText(): string {
  return (
    'הצטרפות לאפליקציית המשמרות והחילופים של השמירה: רואים את השבצ"ק, מבקשים חילופים ומתנדבים להחליף.\n' +
    `נכנסים עם חשבון גוגל, ואחרי אישור מנהל בוחרים את השם ברשימה:\n${appLink()}`
  );
}

const NOTHING = 'nothing';
/** The form first lists only my shifts in the coming weeks; the rest are behind "show more". */
const NEAR_DAYS = 14;

/**
 * Lets a user offer the owner of a shift a swap: one of their own shifts in return, or (when the owner has
 * not asked for a swap) taking it with nothing in return. When the owner did ask, volunteering covers that.
 */
export function RequestForm({
  target,
  owner,
  allowNothing = true,
  onDone,
}: {
  target: ShiftKey;
  owner: string;
  allowNothing?: boolean;
  onDone: () => void;
}) {
  const me = useMe();
  const shifts = useRoster().upcoming;
  const [choice, setChoice] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [note, setNote] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  // Paid swaps exist once the migration is applied (shifts then carry swap_price).
  const paidAvailable = (shifts.data ?? []).some((s) => 'swap_price' in s);
  const { busy, error, run } = useAction();
  const { toast, shareOffer } = useFeedback();
  const phoneOf = usePhoneOf();
  const registered = useIsRegistered(owner);
  const mine = (shifts.data ?? []).filter((s) => me.isMine(s.assignee) && !hasStarted(s.night, s.slot));
  const nearEnd = addDays(israelToday(), NEAR_DAYS);
  const visible = showAll ? mine : mine.filter((s) => s.night <= nearEnd);
  const hidden = mine.length - visible.length;

  // A payment only goes with "nothing in return"; while its amount is empty or out of range, nothing is sent.
  const badPrice = paidAvailable && choice === NOTHING && priceInvalid(price);

  function send() {
    if (!choice || badPrice) return;
    const give = choice === NOTHING ? null : mine.find((s) => `${s.night}/${s.slot}` === choice) ?? null;
    run(
      () =>
        api.sendSwapRequest(
          target.night,
          target.slot,
          give && { night: give.night, slot: give.slot },
          note,
          give ? null : price,
        ),
      () => {
        toast(`ההצעה נשלחה ל${owner}`);
        shareOffer({
          message:
            registered === false
              ? `${owner} עוד לא באפליקציה, ולכן כרגע רק מנהל יכול לאשר. אפשר לשלוח הודעה עם הזמנה להצטרף`
              : `אפשר לשלוח ל${owner} הודעה בוואטסאפ עם קישור לאישור`,
          text: requestSentText({
            id: 0,
            night: target.night,
            slot: target.slot,
            owner,
            requester_id: me.profile.id,
            requester: me.profile.display_name ?? '',
            give_night: give?.night ?? null,
            give_slot: give?.slot ?? null,
            note: note.trim() || null,
            price: give ? null : price,
            status: 'pending',
            created_at: '',
            decided_at: null,
          }, registered !== false),
          label: `הודעה ל${owner}`,
          phone: phoneOf(owner),
        });
        onDone();
      },
    );
  }

  return (
    <section className="request-form">
      <h3>הצעת החלפה ל{owner}</h3>
      <p className="muted small">
        ההחלטה אם לאשר היא של {owner}.{' '}
        {registered === false && <strong>{owner} עוד לא באפליקציה, ולכן כרגע רק מנהל יכול לאשר. </strong>}
        {allowNothing ? 'מה בתמורה?' : 'איזו משמרת שלך בתמורה?'}
      </p>
      {shifts.loading && !shifts.data && <SkeletonList rows={2} />}
      <div className="choices">
        {allowNothing && (
          <label className="choice">
            <input type="radio" name="give" checked={choice === NOTHING} onChange={() => setChoice(NOTHING)} />
            <span>בלי תמורה, רק לקחת את המשמרת</span>
          </label>
        )}
        {visible.map((s) => {
          const key = `${s.night}/${s.slot}`;
          return (
            <label key={key} className="choice">
              <input type="radio" name="give" checked={choice === key} onChange={() => setChoice(key)} />
              <span>המשמרת שלי ב־{shiftText(s.night, s.slot)}</span>
            </label>
          );
        })}
        {hidden > 0 && (
          <button type="button" className="link small" onClick={() => setShowAll(true)}>
            {hidden === 1 ? 'הצגת עוד משמרת אחת שלי' : `הצגת עוד ${hidden} משמרות שלי`}
          </button>
        )}
        {mine.length === 0 && !allowNothing && <p className="muted small">אין לך משמרות קרובות להציע בתמורה.</p>}
      </div>
      {paidAvailable && choice === NOTHING && (
        <PriceField label={`לבקש תשלום מ${owner} על לקיחת המשמרת`} value={price} onChange={setPrice} />
      )}
      <input
        value={note}
        maxLength={300}
        placeholder="הערה (לא חובה)"
        aria-label="הערה להצעה"
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="row">
        <button className="primary" disabled={busy || !choice || badPrice} onClick={send}>
          שליחת ההצעה
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
  const { confirm, toast, shareOffer } = useFeedback();
  const phoneOf = usePhoneOf();
  const exchange = Boolean(r.give_night && r.give_slot);

  function offerUpdate(accepted: boolean) {
    shareOffer({
      message: `אפשר לעדכן את ${r.requester} בוואטסאפ`,
      text: requestDecisionText(r, accepted),
      label: `עדכון ל${r.requester} בוואטסאפ`,
      phone: phoneOf(r.requester),
    });
  }

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
          ) : r.price ? (
            <p>
              <strong>
                יירשם תשלום של ₪{r.price} ממך ל{r.requester}.
              </strong>
            </p>
          ) : (
            <p className="muted">בלי משמרת בתמורה.</p>
          )}
        </>
      ),
      confirmLabel: exchange ? 'אישור ההחלפה' : 'מסירת המשמרת',
    });
    if (ok)
      run(
        () => api.acceptSwapRequest(r.id),
        () => {
          toast(exchange ? 'ההחלפה אושרה' : `המשמרת נמסרה ל${r.requester}`);
          offerUpdate(true);
        },
      );
  }

  async function decline() {
    const ok = await confirm({ title: `לדחות את ההצעה של ${r.requester}?`, confirmLabel: 'דחייה', danger: true });
    if (ok)
      run(
        () => api.declineSwapRequest(r.id),
        () => {
          toast('ההצעה נדחתה');
          offerUpdate(false);
        },
      );
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
        {r.note && <NoteLine note={r.note} className="small" />}
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
