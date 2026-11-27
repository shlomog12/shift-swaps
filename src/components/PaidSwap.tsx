import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { SLOT_HOURS, formatDate, formatDateTime } from '../lib/dates';
import { useFocusTrap } from '../lib/focusTrap';
import { useAction, useMe, useQuery, useRoster } from '../lib/hooks';
import { DEFAULT_SWAP_PRICE, MAX_SWAP_PRICE, paymentOpen, type SwapPayment } from '../lib/types';
import { useFeedback } from './Feedback';
import { formatPhone } from './MyPhone';
import { WhatsAppButton } from './SwapRequests';

/** "Offer a payment" checkbox with the amount (default ₪250, up to ₪500). Calls back with null when off. */
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
  return (
    <div className="price-field">
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked ? clampPrice(amount) : null)}
        />
        <span>{label}</span>
      </label>
      {on && (
        <label className="price-input">
          <span>₪</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_SWAP_PRICE}
            step={10}
            value={amount}
            aria-label="סכום בשקלים"
            onChange={(e) => {
              setAmount(e.target.value);
              onChange(clampPrice(e.target.value));
            }}
          />
          <span className="muted small">עד ₪{MAX_SWAP_PRICE}</span>
        </label>
      )}
    </div>
  );
}

function clampPrice(text: string): number {
  const n = Math.round(Number(text));
  return Number.isFinite(n) ? Math.min(MAX_SWAP_PRICE, Math.max(1, n)) : DEFAULT_SWAP_PRICE;
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
          onSubmit(note, price);
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
          <button type="submit" className="primary">
            {price ? `פרסום הבקשה (₪${price})` : 'פרסום הבקשה'}
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

/** Payments I owe or am owed, at the top of "My shifts": how to pay, and marking it settled. */
export function PaymentsCard() {
  const me = useMe();
  const { payments } = useRoster();
  const [showDone, setShowDone] = useState(false);
  const list = payments.data ?? [];
  const open = list.filter(paymentOpen);
  const done = list.filter((p) => !paymentOpen(p));
  if (list.length === 0) return null;

  const iPay = (p: SwapPayment) =>
    p.payer_id === me.profile.id || (!p.payer_id && me.isMine(p.payer));

  return (
    <section className={open.length > 0 ? 'card attention-card' : 'card'}>
      <h2>תשלומים{open.length > 0 ? ` (${open.length} פתוחים)` : ''}</h2>
      {open.length === 0 && <p className="muted small">אין תשלומים פתוחים.</p>}
      <ul className="payments">
        {open.map((p) => (iPay(p) ? <PayItem key={p.id} payment={p} /> : <ReceiveItem key={p.id} payment={p} />))}
      </ul>
      {done.length > 0 && (
        <details open={showDone} onToggle={(e) => setShowDone((e.target as HTMLDetailsElement).open)}>
          <summary className="muted small">תשלומים שנסגרו ({done.length})</summary>
          <ul className="payments done">
            {done.map((p) => (
              <li key={p.id} className="small">
                {iPay(p) ? `שילמת ₪${p.amount} ל${p.payee}` : `קיבלת ₪${p.amount} מ${p.payer}`} ·{' '}
                {formatDate(p.night)} {SLOT_HOURS[p.slot]} ·{' '}
                <span className="muted">
                  {p.cancelled_at ? 'בוטל על ידי מנהל' : p.received_at ? 'התקבל' : 'שולם'}
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

/** I owe this: who, how much, how to pay, and "paid". */
function PayItem({ payment: p }: { payment: SwapPayment }) {
  const [contact, setContact] = useState<{ phone: string | null; link: string | null } | null>(null);
  const { busy, error, run } = useAction();
  const { confirm, toast } = useFeedback();

  async function showHow() {
    run(async () => setContact((await api.paymentContact(p.id)) ?? { phone: null, link: null }));
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('הועתק');
    } catch {
      toast(text, 'info');
    }
  }

  async function paid() {
    const ok = await confirm({ title: `לסמן ששילמת ₪${p.amount} ל${p.payee}?`, confirmLabel: 'שילמתי' });
    if (ok) run(() => api.markPaymentPaid(p.id), () => toast('סומן ששולם'));
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
          איך לשלם
        </button>
      ) : contact.phone || contact.link ? (
        <div className="pay-how">
          {contact.link && (
            <a className="button small primary" href={contact.link} target="_blank" rel="noopener noreferrer">
              תשלום בפייבוקס
            </a>
          )}
          {contact.phone && (
            <button className="small" onClick={() => copy(contact.phone!)}>
              העתקת הטלפון לביט/פייבוקס: <span className="ltr-inline">{contact.phone}</span>
            </button>
          )}
          <p className="muted small">את אפליקציית ביט או פייבוקס פותחים לבד, ומעבירים ₪{p.amount}.</p>
        </div>
      ) : (
        <p className="small">עוד לא נוספו פרטי תשלום של {p.payee}. אפשר לתאם בוואטסאפ.</p>
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

/** I am owed this: "received", and a reminder to the payer. */
function ReceiveItem({ payment: p }: { payment: SwapPayment }) {
  const { busy, error, run } = useAction();
  const { confirm, toast } = useFeedback();

  async function received() {
    const ok = await confirm({ title: `לסמן שקיבלת ₪${p.amount} מ${p.payer}?`, confirmLabel: 'קיבלתי' });
    if (ok) run(() => api.markPaymentReceived(p.id), () => toast('סומן שהתקבל'));
  }

  return (
    <li className="payment-item">
      <span>
        <strong>
          מגיע לך ₪{p.amount} מ{p.payer}
        </strong>
        <span className="muted small"> · על המשמרת ב־{shiftLine(p)}</span>
      </span>
      <div className="row wrap">
        <button className="primary small" disabled={busy} onClick={received}>
          קיבלתי
        </button>
        <WhatsAppButton
          className="small"
          text={`היי ${p.payer}, תזכורת: ₪${p.amount} על המשמרת ב־${shiftLine(p)}. הפרטים באפליקציה, בלשונית "שלי".`}
          label={`תזכורת ל${p.payer}`}
          to={p.payer}
        />
      </div>
      {error && <p className="error small">{error}</p>}
    </li>
  );
}

/** Profile: how others pay me (my phone for Bit/PayBox, a PayBox link). Shown only to whoever owes me. */
export function PaymentDetailsSection() {
  const mine = useQuery(() => api.myPaymentDetails().catch(() => undefined), []);
  const [link, setLink] = useState('');
  const { busy, error, run } = useAction();
  const { toast } = useFeedback();

  useEffect(() => {
    if (mine.data) setLink(mine.data.link ?? '');
  }, [mine.data]);

  // Before the paid-swaps migration the function does not exist: hide the section.
  if (mine.loading || mine.data === undefined) return null;
  const phone = mine.data?.phone;

  return (
    <section className="profile-section">
      <h3>איך לשלם לי</h3>
      <p className="muted small">
        לחילופים בתשלום. מוצג רק למי שצריך להעביר לך כסף, ורק כשיש ביניכם תשלום פתוח.
      </p>
      <p className="small">
        {phone ? (
          <>
            טלפון לביט / פייבוקס: <span className="ltr-inline">{formatPhone(phone.replace(/^0/, '972'))}</span>. זה
            המספר מ&quot;מספר הטלפון שלי&quot;, ושם משנים אותו.
          </>
        ) : (
          <>אין עדיין טלפון לביט / פייבוקס. אפשר להוסיף אותו למעלה, ב&quot;מספר הטלפון שלי&quot;.</>
        )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api.setMyPaymentLink(link), () => toast('הקישור נשמר'));
        }}
      >
        <label>
          קישור תשלום של פייבוקס (לא חובה)
          <input type="url" dir="ltr" value={link} placeholder="https://..." onChange={(e) => setLink(e.target.value)} />
        </label>
        <button className="primary" disabled={busy || link.trim() === (mine.data?.link ?? '')}>
          שמירה
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
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
