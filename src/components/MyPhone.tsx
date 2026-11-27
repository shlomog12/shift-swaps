import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, useMe, useQuery } from '../lib/hooks';
import { useFeedback } from './Feedback';

/** Shows +972501234567 as 050-123-4567 for Israeli numbers. */
export function formatPhone(phone: string): string {
  const local = phone.startsWith('972') ? `0${phone.slice(3)}` : `+${phone}`;
  return /^0\d{9}$/.test(local) ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` : local;
}

const WHO_SEES = 'המספר מוצג למשתמשים המאושרים באפליקציה, כדי שהודעות וואטסאפ על חילופים ייפתחו ישר בשיחה איתך.';

/** The phone field with save; empty and save deletes the number. */
function PhoneForm({ current, onSaved }: { current: string | null; onSaved?: () => void }) {
  const [phone, setPhone] = useState('');
  const { busy, error, run } = useAction();
  const { toast } = useFeedback();
  const shown = current ? formatPhone(current) : '';

  useEffect(() => setPhone(shown), [shown]);

  return (
    <>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => api.setMyPhone(phone),
            () => {
              toast(phone.trim() ? 'המספר נשמר' : 'המספר נמחק');
              onSaved?.();
            },
          );
        }}
      >
        <input
          type="tel"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          placeholder="050-1234567"
          aria-label="מספר טלפון"
          onChange={(e) => setPhone(e.target.value)}
        />
        <button className="primary" disabled={busy || phone.trim() === shown}>
          שמירה
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </>
  );
}

/** Profile: my phone, for WhatsApp straight to me and for Bit/PayBox. */
export function MyPhoneSection() {
  const me = useMe();
  const mine = useQuery(api.myPhone, []);

  return (
    <section className="profile-section">
      <h3>מספר הטלפון שלי</h3>
      <p className="muted small">
        {WHO_SEES} משמש גם לתשלום בפייבוקס בחילופים בתשלום. לא חובה, ואפשר למחוק בכל רגע.
      </p>
      {me.profile.is_admin && (
        <p className="small warning-note">
          למנהלים: המספר מוצג גם במסך ההמתנה, כדי שמי שנרשם יוכל לבקש אישור. כלומר גם לאנשים שעוד לא אושרו ואולי
          לא מוכרים לך.
        </p>
      )}
      <PhoneForm current={mine.data ?? null} />
    </section>
  );
}

const TIP_KEY = 'phone-tip';

/**
 * Once a user has their name, suggests adding a phone (not required). Hidden after saving or "not now", and
 * before the member-phones migration is applied (my_phone then fails).
 */
export function PhoneTip() {
  const me = useMe();
  const mine = useQuery(api.myPhone, []);
  const [hidden, setHidden] = useState(() => localStorage.getItem(TIP_KEY) === 'off');

  if (hidden || !me.profile.display_name || mine.data !== null) return null;

  function hide() {
    localStorage.setItem(TIP_KEY, 'off');
    setHidden(true);
  }

  return (
    <section className="card phone-tip">
      <h3>מומלץ להוסיף מספר טלפון</h3>
      <p className="small">
        {WHO_SEES} משמש גם לתשלום בחילופים בתשלום. לא חובה, ואפשר להוסיף או למחוק אחר כך בפרופיל.
      </p>
      <PhoneForm current={null} onSaved={hide} />
      <button className="link small" onClick={hide}>
        לא עכשיו
      </button>
    </section>
  );
}
