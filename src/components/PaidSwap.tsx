import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { SLOT_HOURS, formatDate, formatDateTime } from '../lib/dates';
import { useFocusTrap } from '../lib/focusTrap';
import { useAction, useMe, useQuery, useRoster, type Me } from '../lib/hooks';
import {
  DEFAULT_SWAP_PRICE,
  MAX_SWAP_PRICE,
  MIN_SWAP_PRICE,
  PAYMENT_CONFIRM_DAYS,
  PRICE_PRESETS,
  paymentNeedsMe,
  paymentStage,
  type SwapPayment,
} from '../lib/types';
import { useFeedback } from './Feedback';
import { WhatsAppButton } from './SwapRequests';

/**
 * "Offer a payment" checkbox with the amount (default ₪250, ₪10 to ₪500) and quick picks. Calls back with
 * null when off, and with NaN while the amount is empty or out of range (see priceInvalid), so the form can
 * block sending instead of silently sending another amount.
 */
export function PriceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (price: number | null) => void;
}) {
  const [amount, setAmount] = useState(String(value ?? DEFAULT_SWAP_PRICE));
  const on = value !== null;
  const invalid = priceInvalid(value);

  function set(text: string) {
    setAmount(text);
    onChange(parsePrice(text));
  }

  return (
    <div className="price-field">
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked ? parsePrice(amount) : null)}
        />
        <span>{label}</span>
      </label>
      {on && (
        <>
          <div className="price-presets" role="group" aria-label="סכומים מהירים">
            {PRICE_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                className={value === n ? 'chip selected' : 'chip'}
                aria-pressed={value === n}
                onClick={() => set(String(n))}
              >
                ₪{n}
              </button>
            ))}
          </div>
          <label className="price-input">
            <span>₪</span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_SWAP_PRICE}
              max={MAX_SWAP_PRICE}
              step={10}
              value={amount}
              aria-label="סכום בשקלים"
              aria-invalid={invalid}
              onChange={(e) => set(e.target.value)}
            />
            <span className="muted small">
              ₪{MIN_SWAP_PRICE} עד ₪{MAX_SWAP_PRICE}
            </span>
          </label>
          {invalid && (
            <p className="error small" role="alert">
              {amount.trim() === '' ? 'צריך לכתוב סכום, או לבטל את הסימון.' : `הסכום צריך להיות בין ₪${MIN_SWAP_PRICE} ל־₪${MAX_SWAP_PRICE}, בשקלים שלמים.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function parsePrice(text: string): number {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) && n >= MIN_SWAP_PRICE && n <= MAX_SWAP_PRICE ? n : NaN;
}

/** True when a payment is on but its amount cannot be sent. */
export function priceInvalid(price: number | null): boolean {
  return price !== null && Number.isNaN(price);
}

/** The publish-a-swap-request dialog: an optional note and, when paid swaps are available, an amount. */
export function SwapRequestDialog({
  title,
  message,
  withPrice,
  onSubmit,
  onClose,
}: {
  title: string;
  message: ReactNode;
  withPrice: boolean;
  onSubmit: (note: string, price: number | null) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  useFocusTrap(ref);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <form
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="swap-request-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!priceInvalid(price)) onSubmit(note, price);
        }}
      >
        <h2 id="swap-request-title">{title}</h2>
        <div className="dialog-message">{message}</div>
        <input
          value={note}
          maxLength={300}
          placeholder="הערה (לא חובה), למשל: אפשר להחליף ביום חמישי"
          aria-label="הערה"
          onChange={(e) => setNote(e.target.value)}
        />
        {withPrice && <PriceField label="להציע תשלום למי שיחליף" value={price} onChange={setPrice} />}
        <div className="dialog-buttons">
          <button type="button" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" className="primary" disabled={priceInvalid(price)}>
            {price && !priceInvalid(price) ? `פרסום הבקשה (₪${price})` : 'פרסום הבקשה'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** A ₪ tag for a swap request or offer with an amount. */
export function PriceTag({ price }: { price: number | null | undefined }) {
  if (!price) return null;
  return <span className="tag price-tag">₪{price}</span>;
}

/** Whether I am the one who pays this payment (by account, or by roster name before the payer joined). */
export function isPayer(p: SwapPayment, me: Me): boolean {
  return p.payer_id === me.profile.id || (!p.payer_id && me.isMine(p.payer));
}

/** How many payments wait for me: to pay, or to confirm a payment marked paid. */
export function paymentsNeedingMe(list: SwapPayment[], me: Me): number {
  return list.filter((p) => paymentNeedsMe(p, isPayer(p, me))).length;
}

/** Payments I owe or am owed, at the top of "My shifts": how to pay, and marking it paid / received. */
export function PaymentsCard() {
  const me = useMe();
  const { payments } = useRoster();
  const [showDone, setShowDone] = useState(false);
  const list = payments.data ?? [];
  const open = list.filter((p) => paymentStage(p) !== 'done');
  const done = list.filter((p) => paymentStage(p) === 'done');
  const needing = paymentsNeedingMe(list, me);
  if (list.length === 0) return null;

  return (
    <section className={needing > 0 ? 'card attention-card' : 'card'}>
      <h2>
        תשלומים
        {needing === 1 ? ' (אחד מחכה לך)' : needing > 1 ? ` (${needing} מחכים לך)` : ''}
      </h2>
      {open.length === 0 && <p className="muted small">אין תשלומים פתוחים.</p>}
      <ul className="payments">
        {open.map((p) =>
          isPayer(p, me) ? <PayItem key={p.id} payment={p} /> : <ReceiveItem key={p.id} payment={p} />,
        )}
      </ul>
      {done.length > 0 && (
        <details open={showDone} onToggle={(e) => setShowDone((e.target as HTMLDetailsElement).open)}>
          <summary className="muted small">תשלומים שנסגרו ({done.length})</summary>
          <ul className="payments done">
            {done.map((p) => (
              <li key={p.id} className="small">
                {isPayer(p, me) ? `שילמת ₪${p.amount} ל${p.payee}` : `קיבלת ₪${p.amount} מ${p.payer}`} ·{' '}
                {formatDate(p.night)} {SLOT_HOURS[p.slot]} ·{' '}
                <span className="muted">
                  {p.cancelled_at
                    ? 'בוטל על ידי מנהל'
                    : p.received_at
                      ? 'התקבל'
                      : `סומן ששולם, ונסגר אחרי ${PAYMENT_CONFIRM_DAYS} ימים בלי תשובה`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function shiftLine(p: SwapPayment) {
  return `${formatDate(p.night)} · ${SLOT_HOURS[p.slot]}`;
}

/** I owe this: who, how much, how to pay, and "paid"; once marked paid, it waits for the payee. */
function PayItem({ payment: p }: { payment: SwapPayment }) {
  const [contact, setContact] = useState<{ phone: string | null } | null>(null);
  const { busy, error, run } = useAction();
  const { confirm, toast } = useFeedback();
  const awaiting = paymentStage(p) === 'awaiting';

  // Shows the payee's phone and copies it, ready to paste in PayBox.
  async function showHow() {
    run(async () => {
      const c = (await api.paymentContact(p.id)) ?? { phone: null };
      setContact(c);
      if (c.phone) await copy(c.phone);
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('המספר הועתק');
    } catch {
      toast(text, 'info');
    }
  }

  async function paid() {
    const ok = await confirm({
      title: `לסמן ששילמת ₪${p.amount} ל${p.payee}?`,
      message: `${p.payee} יתבקשו לאשר שהכסף הגיע.`,
      confirmLabel: 'שילמתי',
    });
    if (ok) run(() => api.markPaymentPaid(p.id), () => toast(`סומן ששולם. מחכים לאישור של ${p.payee}`));
  }

  if (awaiting) {
    return (
      <li className="payment-item">
        <span>
          <strong>
            שילמת ₪{p.amount} ל{p.payee}
          </strong>
          <span className="muted small"> · על המשמרת ב־{shiftLine(p)}</span>
        </span>
        <p className="muted small">
          מחכים לאישור של {p.payee} שהכסף הגיע. בלי תשובה, התשלום ייסגר מעצמו אחרי {PAYMENT_CONFIRM_DAYS} ימים.
        </p>
        <WhatsAppButton
          className="small"
          text={`היי ${p.payee}, העברתי לך ₪${p.amount} על המשמרת ב־${shiftLine(p)}. אפשר לאשר באפליקציה, בלשונית "שלי".`}
          label={`הודעה ל${p.payee}`}
          to={p.payee}
        />
      </li>
    );
  }

  return (
    <li className="payment-item">
      <span>
        <strong>
          לשלם ₪{p.amount} ל{p.payee}
        </strong>
        <span className="muted small"> · על המשמרת ב־{shiftLine(p)}</span>
      </span>
      {!contact ? (
        <button className="small" disabled={busy} onClick={showHow}>
          תשלום בפייבוקס
        </button>
      ) : contact.phone ? (
        <div className="pay-how">
          <button className="small" onClick={() => copy(contact.phone!)}>
            הטלפון של {p.payee}: <span className="ltr-inline">{contact.phone}</span> (העתקה)
          </button>
          <p className="muted small">
            המספר הועתק. בפייבוקס: העברת כסף, מדביקים את המספר ומעבירים ₪{p.amount}.
          </p>
        </div>
      ) : (
        <p className="small">אין עדיין באפליקציה מספר טלפון של {p.payee}. אפשר לבקש אותו בוואטסאפ.</p>
      )}
      <div className="row wrap">
        <button className="primary small" disabled={busy} onClick={paid}>
          שילמתי
        </button>
        <WhatsAppButton
          className="small"
          text={`היי ${p.payee}, לגבי ₪${p.amount} על המשמרת ב־${shiftLine(p)}: איך הכי נוח לך לקבל?`}
          label={`הודעה ל${p.payee}`}
          to={p.payee}
        />
      </div>
      {error && <p className="error small">{error}</p>}
    </li>
  );
}

/** I am owed this: a reminder while unpaid; once marked paid, "received" or "not received". */
function ReceiveItem({ payment: p }: { payment: SwapPayment }) {
  const { busy, error, run } = useAction();
  const { confirm, toast } = useFeedback();
  const awaiting = paymentStage(p) === 'awaiting';

  async function received() {
    const ok = await confirm({ title: `לאשר שקיבלת ₪${p.amount} מ${p.payer}?`, confirmLabel: 'קיבלתי' });
    if (ok) run(() => api.markPaymentReceived(p.id), () => toast('התשלום נסגר'));
  }

  async function notReceived() {
    const ok = await confirm({
      title: `הכסף מ${p.payer} לא הגיע?`,
      message: `התשלום יחזור ל"ממתין לתשלום", ו${p.payer} יקבלו הודעה לבדוק את ההעברה.`,
      confirmLabel: 'לא קיבלתי',
      danger: true,
    });
    if (ok) run(() => api.paymentNotReceived(p.id), () => toast(`נשלחה הודעה ל${p.payer}`));
  }

  return (
    <li className={awaiting ? 'payment-item needs-me' : 'payment-item'}>
      <span>
        <strong>
          {awaiting ? `${p.payer} סימנו ששילמו לך ₪${p.amount}` : `מגיע לך ₪${p.amount} מ${p.payer}`}
        </strong>
        <span className="muted small"> · על המשמרת ב־{shiftLine(p)}</span>
      </span>
      {awaiting && <p className="small">הכסף הגיע? כדאי לבדוק בפייבוקס ולאשר.</p>}
      <div className="row wrap">
        <button className="primary small" disabled={busy} onClick={received}>
          קיבלתי
        </button>
        {awaiting ? (
          <button className="small" disabled={busy} onClick={notReceived}>
            לא קיבלתי
          </button>
        ) : (
          <WhatsAppButton
            className="small"
            text={`היי ${p.payer}, תזכורת: ₪${p.amount} על המשמרת ב־${shiftLine(p)}. הפרטים באפליקציה, בלשונית "שלי".`}
            label={`תזכורת ל${p.payer}`}
            to={p.payer}
          />
        )}
      </div>
      {error && <p className="error small">{error}</p>}
    </li>
  );
}

/** Admin: payments nobody has marked settled yet, with cancel. */
export function OpenPaymentsPanel() {
  const payments = useQuery(() => api.adminOpenPayments().catch(() => undefined), []);
  const { busy, error, run } = useAction();
  const { confirm, toast } = useFeedback();
  if (payments.data === undefined) return null;

  async function cancel(p: SwapPayment) {
    const ok = await confirm({
      title: `לבטל את התשלום של ₪${p.amount}?`,
      message: `${p.payer} ← ${p.payee}, על המשמרת ב־${shiftLine(p)}. למשל כשהחילוף בוטל אחרי האישור.`,
      confirmLabel: 'ביטול התשלום',
      danger: true,
    });
    if (ok) run(() => api.adminCancelPayment(p.id), () => toast('התשלום בוטל'));
  }

  return (
    <section className="card">
      <h2>תשלומים פתוחים</h2>
      {payments.data.length === 0 && <p className="muted small">אין תשלומים פתוחים.</p>}
      <ul className="payments">
        {payments.data.map((p) => (
          <li key={p.id} className="payment-item">
            <span>
              <strong>
                {p.payer} ← {p.payee}: ₪{p.amount}
              </strong>
              <span className="muted small">
                {' '}
                · {shiftLine(p)} · נרשם {formatDateTime(p.created_at)}
                {paymentStage(p) === 'awaiting' && ` · סומן ששולם, מחכה לאישור של ${p.payee}`}
              </span>
            </span>
            <button className="small danger" disabled={busy} onClick={() => cancel(p)}>
              ביטול
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
