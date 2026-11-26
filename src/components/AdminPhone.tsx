import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, useMe, useQuery } from '../lib/hooks';
import { useFeedback } from './Feedback';

/** Shows +972501234567 as 050-123-4567 for Israeli numbers. */
export function formatPhone(phone: string): string {
  const local = phone.startsWith('972') ? `0${phone.slice(3)}` : `+${phone}`;
  return /^0\d{9}$/.test(local) ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` : local;
}

/** Lets an admin add a phone, so users waiting for approval can message them on WhatsApp. */
export function AdminPhonePanel() {
  const me = useMe();
  const contacts = useQuery(api.adminContacts, []);
  const current = (contacts.data ?? []).find((c) => c.id === me.profile.id)?.phone ?? '';
  const [phone, setPhone] = useState('');
  const { busy, error, run } = useAction();
  const { toast } = useFeedback();

  useEffect(() => setPhone(current ? formatPhone(current) : ''), [current]);

  return (
    <section className="profile-section">
      <h3>הטלפון שלי לפניות בוואטסאפ</h3>
      <p className="muted small">
        מי שנרשם וממתין לאישור יוכל לפנות אליך בוואטסאפ ישירות ממסך ההמתנה.
      </p>
      <p className="small warning-note">
        שימו לב: המספר זמין לכל מי שמתחבר לאפליקציה עם חשבון גוגל, גם לפני שאושר – כלומר גם לאנשים שלא מוכרים לך.
        אפשר למחוק אותו בכל רגע.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => api.setMyPhone(phone),
            () => toast(phone.trim() ? 'המספר נשמר' : 'המספר נמחק'),
          );
        }}
      >
        <input
          type="tel"
          dir="ltr"
          inputMode="tel"
          value={phone}
          placeholder="050-1234567"
          aria-label="מספר טלפון"
          onChange={(e) => setPhone(e.target.value)}
        />
        <button
          className="primary"
          disabled={busy || contacts.loading || phone.trim() === (current ? formatPhone(current) : '')}
        >
          שמירה
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
